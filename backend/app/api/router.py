"""Main API router — aggregates all sub-routers.

Usage in main.py:
    from app.api.router import api_router
    app.include_router(api_router)
"""

from fastapi import APIRouter

from app.api import (
    auth,
    users,
    roles,
    suppliers,
    rolls,
    skus,
    lots,
    batches,
    inventory,
    orders,
    invoices,
    dashboard,
    mobile,
    external,
    masters,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(roles.router)
api_router.include_router(suppliers.router)
api_router.include_router(rolls.router)
api_router.include_router(skus.router)
api_router.include_router(lots.router)
api_router.include_router(batches.router)
api_router.include_router(inventory.router)
api_router.include_router(orders.router)
api_router.include_router(invoices.router)
api_router.include_router(dashboard.router)
api_router.include_router(mobile.router)
api_router.include_router(external.router)
api_router.include_router(masters.router)
