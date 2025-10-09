# Design Decisions - Bulk Company Export Feature

## Demo Video
[Loom Video Demo](https://www.loom.com/share/602ecd5e59f444d6baae43707e92e858?sid=10639d6a-a34c-4e27-97d9-4b5de30e8b3f)

## Approach

My approach uses FastAPI's Background Tasks to deal with bulk database actions (moving companies from list to list), along with the necessary UI components to accompany the new feature. Uses polling + task ID to update progress for UI.

## Current Implementation

I decided to use FastAPI's Background Tasks along with in-memory queue storage for speed of development. However, this leads to scalability and stability issues due to the in-memory task storage and processes along with being unable to horizontally scale this implementation. A better solution would be to use Redis as a task queue and to use a better scaling queue management system like Celery or Amazon SQS if our system is hosted on Amazon. I also took into account conflicting and concurrent processes. I used polling to update progress on all pending tasks. Other approaches like websockets could be better for low latency, but the overhead is not needed for this use case. 

## Next Steps

For next steps, I would implement the above production-grade solutions for better scalability and stability. I am also aware that the database is artificially throttled currently, but in a real setting I would look into fixing the database write speed if the speed of this feature is important to users. I would also improve the UI and make the page and process look more professional. I would also add better documentation and add thorough unit testing to ensure my feature is functional and maintanable. 
