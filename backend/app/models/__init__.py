"""All ORM models — imported here so Alembic and Base.metadata discover them."""

from app.models.role import Role
from app.models.user import User
from app.models.supplier import Supplier
from app.models.roll import Roll
from app.models.sku import SKU
from app.models.batch import Batch
from app.models.batch_assignment import BatchAssignment
from app.models.batch_roll_consumption import BatchRollConsumption
from app.models.inventory_event import InventoryEvent
from app.models.inventory_state import InventoryState
from app.models.reservation import Reservation
from app.models.order import Order
from app.models.order_item import OrderItem
from app.models.invoice import Invoice
from app.models.invoice_item import InvoiceItem

__all__ = [
    "Role",
    "User",
    "Supplier",
    "Roll",
    "SKU",
    "Batch",
    "BatchAssignment",
    "BatchRollConsumption",
    "InventoryEvent",
    "InventoryState",
    "Reservation",
    "Order",
    "OrderItem",
    "Invoice",
    "InvoiceItem",
]
