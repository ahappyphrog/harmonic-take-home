# Design Decisions - Bulk Company Export Feature

## Demo Video
[Loom Video Demo](https://www.loom.com/share/b722533f960141c082b91790406ff72f?sid=0fae4133-c7c6-429f-aafd-8800121cdbb0)

## Approach

My approach uses FastAPI's Background Tasks to deal with bulk database actions (moving companies from list to list), along with the necessary UI components to accompany the new feature. Uses polling + task ID to update progress for UI.

## Current Implementation

I decided to use FastAPI's Background Tasks along with in-memory queue storage for speed of development. However, this leads to scalability and stability issues due to the in-memory task storage and processes along with being unable to horizontally scale this implementation. A better solution would be to use Redis as a task queue and to use a better scaling queue management system like Celery or Amazon SQS if our system is hosted on Amazon.

## Next Steps

For next steps, I would implement the above production-grade solutions for better scalability and stability. I am also aware that the database is artificially throttled currently, but in a real setting I would look into fixing the database write speed if the speed of this feature is important to users. I would also improve the UI and make the page and process look more professional. The current status tracking toast notification should also be improved to be less obstructive -- such as only showing export task statuses on the associated collection. I would also add better documentation and add thorough unit testing to ensure my feature is functional and maintanable. 
