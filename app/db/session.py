from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.config import settings

engine = create_async_engine(settings().database_url, pool_size=3, max_overflow=2, pool_pre_ping=True)
Session = async_sessionmaker(engine, expire_on_commit=False)


async def db():
    async with Session() as session:
        yield session
