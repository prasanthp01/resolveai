from fastapi import FastAPI
from pydantic import BaseModel, Field
import asyncio

app = FastAPI()


class IncidentCreate(BaseModel):    
    event_id:str = Field(min_length = 1)
    service:str = Field(min_length = 1)
    error_rate:float = Field(ge = 0, le = 100)
    message:str = Field(min_length = 1)



@app.get("/health")
async def health():
    return {"service":"resolveai-api", "status":"OK"}


@app.post("/incidents/validate")
async def validate(incident:IncidentCreate):
    input = incident.model_dump()
    print(input)
    return {"valid":True, "incident":input}