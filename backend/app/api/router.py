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
    batch_challans,
    inventory,
    orders,
    invoices,
    shipments,
    dashboard,
    mobile,
    external,
    masters,
    job_challans,
    events,
    customers,
    brokers,
    transports,
    ledger,
    company,
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
api_router.include_router(batch_challans.router)
api_router.include_router(inventory.router)
api_router.include_router(orders.router)
api_router.include_router(invoices.router)
api_router.include_router(shipments.router)
api_router.include_router(dashboard.router)
api_router.include_router(mobile.router)
api_router.include_router(external.router)
api_router.include_router(masters.router)
api_router.include_router(job_challans.router)
api_router.include_router(events.router)
api_router.include_router(customers.router)
api_router.include_router(brokers.router)
api_router.include_router(transports.router)
api_router.include_router(ledger.router)
api_router.include_router(company.router)
