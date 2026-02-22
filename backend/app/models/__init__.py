"""All ORM models — imported here so Alembic and Base.metadata discover them."""

from app.models.role import Role
from app.models.user import User
from app.models.supplier import Supplier
from app.models.roll import Roll, RollProcessing
from app.models.sku import SKU
from app.models.lot import Lot, LotRoll
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
from app.models.product_type import ProductType
from app.models.color import Color
from app.models.fabric import Fabric
from app.models.value_addition import ValueAddition
from app.models.job_challan import JobChallan

__all__ = [
    "Role",
    "User",
    "Supplier",
    "Roll",
    "RollProcessing",
    "SKU",
    "Lot",
    "LotRoll",
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
    "ProductType",
    "Color",
    "Fabric",
    "ValueAddition",
    "JobChallan",
]
