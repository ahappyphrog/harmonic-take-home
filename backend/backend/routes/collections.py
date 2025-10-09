import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.db import database
from backend.models.tasks import TaskStatus, task_store
from backend.routes.companies import (
    CompanyBatchOutput,
    fetch_companies_with_liked,
)

router = APIRouter(
    prefix="/collections",
    tags=["collections"],
)


class CompanyCollectionMetadata(BaseModel):
    id: uuid.UUID
    collection_name: str


class CompanyCollectionOutput(CompanyBatchOutput, CompanyCollectionMetadata):
    pass


@router.get("", response_model=list[CompanyCollectionMetadata])
def get_all_collection_metadata(
    db: Session = Depends(database.get_db),
):
    collections = db.query(database.CompanyCollection).all()

    return [
        CompanyCollectionMetadata(
            id=collection.id,
            collection_name=collection.collection_name,
        )
        for collection in collections
    ]


@router.get("/{collection_id}", response_model=CompanyCollectionOutput)
def get_company_collection_by_id(
    collection_id: uuid.UUID,
    offset: int = Query(
        0, description="The number of items to skip from the beginning"
    ),
    limit: int = Query(10, description="The number of items to fetch"),
    db: Session = Depends(database.get_db),
):
    query = (
        db.query(database.CompanyCollectionAssociation, database.Company)
        .join(database.Company)
        .filter(database.CompanyCollectionAssociation.collection_id == collection_id)
    )

    total_count = query.with_entities(func.count()).scalar()

    results = query.offset(offset).limit(limit).all()
    companies = fetch_companies_with_liked(db, [company.id for _, company in results])

    return CompanyCollectionOutput(
        id=collection_id,
        collection_name=db.query(database.CompanyCollection)
        .get(collection_id)
        .collection_name,
        companies=companies,
        total=total_count,
    )


class AddCompaniesRequest(BaseModel):
    """Request body for adding individual companies to a collection."""
    company_ids: list[int]


class AddCompaniesResponse(BaseModel):
    """Response for adding individual companies."""
    added_count: int


@router.post("/{collection_id}/companies", response_model=AddCompaniesResponse)
def add_companies_to_collection(
    collection_id: uuid.UUID,
    request: AddCompaniesRequest,
    db: Session = Depends(database.get_db),
):
    """Add individual companies to a collection."""
    # Validate collection exists
    collection = db.query(database.CompanyCollection).get(collection_id)
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")

    # Validate companies exist
    companies = (
        db.query(database.Company)
        .filter(database.Company.id.in_(request.company_ids))
        .all()
    )
    if len(companies) != len(request.company_ids):
        raise HTTPException(status_code=404, detail="One or more companies not found")

    # Add companies to collection (using INSERT ... ON CONFLICT for duplicate handling)
    added_count = 0
    for company_id in request.company_ids:
        try:
            association = database.CompanyCollectionAssociation(
                company_id=company_id,
                collection_id=collection_id,
            )
            db.add(association)
            db.commit()
            added_count += 1
        except IntegrityError:
            # Company already in collection, skip
            db.rollback()
            continue

    return AddCompaniesResponse(added_count=added_count)


class BulkAddRequest(BaseModel):
    """Request body for bulk adding companies from another collection."""
    source_collection_id: uuid.UUID


class BulkAddResponse(BaseModel):
    """Response for initiating a bulk add operation."""
    task_id: uuid.UUID
    estimated_count: int


@router.post("/{collection_id}/companies/bulk", response_model=BulkAddResponse)
def bulk_add_companies_from_collection(
    collection_id: uuid.UUID,
    request: BulkAddRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
):
    """Add all companies from a source collection to target collection (background task)."""
    # Validate both collections exist
    target_collection = db.query(database.CompanyCollection).get(collection_id)
    if not target_collection:
        raise HTTPException(status_code=404, detail="Target collection not found")

    source_collection = db.query(database.CompanyCollection).get(
        request.source_collection_id
    )
    if not source_collection:
        raise HTTPException(status_code=404, detail="Source collection not found")

    # Get count of companies to add
    company_count = (
        db.query(database.CompanyCollectionAssociation)
        .filter(
            database.CompanyCollectionAssociation.collection_id
            == request.source_collection_id
        )
        .count()
    )

    # Create task
    task = task_store.create_task(
        total_items=company_count,
        message=f"Adding companies from {source_collection.collection_name} to {target_collection.collection_name}",
    )

    # Schedule background task
    background_tasks.add_task(
        _bulk_add_companies_background,
        task_id=task.id,
        source_collection_id=request.source_collection_id,
        target_collection_id=collection_id,
    )

    return BulkAddResponse(task_id=task.id, estimated_count=company_count)


def _bulk_add_companies_background(
    task_id: uuid.UUID,
    source_collection_id: uuid.UUID,
    target_collection_id: uuid.UUID,
):
    """Background task to bulk add companies between collections."""
    db = database.SessionLocal()
    try:
        # Update task to in_progress
        task_store.update_task(task_id, status=TaskStatus.IN_PROGRESS, current=0)

        # Get all company IDs from source collection
        company_ids = (
            db.query(database.CompanyCollectionAssociation.company_id)
            .filter(
                database.CompanyCollectionAssociation.collection_id
                == source_collection_id
            )
            .all()
        )
        company_ids = [cid[0] for cid in company_ids]

        # Process in batches of 100 for progress updates
        batch_size = 100
        total_added = 0

        for i in range(0, len(company_ids), batch_size):
            batch = company_ids[i : i + batch_size]

            # Use raw SQL for efficient batch insert with conflict handling
            # This is much faster than individual ORM inserts
            values = ",".join(
                [f"({company_id}, '{target_collection_id}')" for company_id in batch]
            )
            query = text(
                f"""
                INSERT INTO company_collection_associations (company_id, collection_id)
                VALUES {values}
                ON CONFLICT (company_id, collection_id) DO NOTHING
                """
            )
            result = db.execute(query)
            db.commit()

            total_added += result.rowcount if result.rowcount else 0

            # Update progress
            current_progress = min(i + batch_size, len(company_ids))
            task_store.update_task(
                task_id,
                status=TaskStatus.IN_PROGRESS,
                current=current_progress,
            )

        # Mark task as completed
        duplicates = len(company_ids) - total_added
        task_store.update_task(
            task_id,
            status=TaskStatus.COMPLETED,
            current=len(company_ids),
            message=f"Successfully added {total_added} companies ({duplicates} duplicates skipped)",
        )

    except Exception as e:
        # Mark task as failed
        task_store.update_task(
            task_id,
            status=TaskStatus.FAILED,
            error=str(e),
        )
    finally:
        db.close()
