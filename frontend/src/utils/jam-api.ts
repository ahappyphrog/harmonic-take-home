import axios from 'axios';

export interface ICompany {
    id: number;
    company_name: string;
    liked: boolean;
}

export interface ICollection {
    id: string;
    collection_name: string;
    companies: ICompany[];
    total: number;
}

export interface ICompanyBatchResponse {
    companies: ICompany[];
}

const BASE_URL = 'http://localhost:8000';

export async function getCompanies(offset?: number, limit?: number): Promise<ICompanyBatchResponse> {
    try {
        const response = await axios.get(`${BASE_URL}/companies`, {
            params: {
                offset,
                limit,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function getCollectionsById(id: string, offset?: number, limit?: number): Promise<ICollection> {
    try {
        const response = await axios.get(`${BASE_URL}/collections/${id}`, {
            params: {
                offset,
                limit,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export async function getCollectionsMetadata(): Promise<ICollection[]> {
    try {
        const response = await axios.get(`${BASE_URL}/collections`);
        return response.data;
    } catch (error) {
        console.error('Error fetching companies:', error);
        throw error;
    }
}

export interface IAddCompaniesRequest {
    company_ids: number[];
}

export interface IAddCompaniesResponse {
    added_count: number;
}

export async function addCompaniesToCollection(
    collectionId: string,
    companyIds: number[]
): Promise<IAddCompaniesResponse> {
    try {
        const response = await axios.post(
            `${BASE_URL}/collections/${collectionId}/companies`,
            { company_ids: companyIds }
        );
        return response.data;
    } catch (error) {
        console.error('Error adding companies to collection:', error);
        throw error;
    }
}

export interface IBulkAddRequest {
    source_collection_id: string;
}

export interface IBulkAddResponse {
    task_id: string;
    estimated_count: number;
}

export async function bulkAddCompaniesFromCollection(
    targetCollectionId: string,
    sourceCollectionId: string
): Promise<IBulkAddResponse> {
    try {
        const response = await axios.post(
            `${BASE_URL}/collections/${targetCollectionId}/companies/bulk`,
            { source_collection_id: sourceCollectionId }
        );
        return response.data;
    } catch (error) {
        console.error('Error bulk adding companies:', error);
        throw error;
    }
}

export interface ITaskProgress {
    current: number;
    total: number;
}

export interface ITask {
    id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    progress: ITaskProgress | null;
    message: string | null;
    error: string | null;
    created_at: string;
    updated_at: string;
}

export async function getTaskStatus(taskId: string): Promise<ITask> {
    try {
        const response = await axios.get(`${BASE_URL}/tasks/${taskId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching task status:', error);
        throw error;
    }
}