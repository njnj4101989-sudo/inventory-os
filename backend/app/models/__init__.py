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
from app.models.va_party import VAParty
from app.models.supplier_invoice import SupplierInvoice
from app.models.purchase_item import PurchaseItem
from app.models.job_challan import JobChallan
from app.models.batch_challan import BatchChallan
from app.models.batch_processing import BatchProcessing
from app.models.customer import Customer
from app.models.broker import Broker
from app.models.transport import Transport
from app.models.ledger_entry import LedgerEntry
from app.models.company import Company
from app.models.user_company import UserCompany
from app.models.shipment import Shipment
from app.models.shipment_item import ShipmentItem
from app.models.financial_year import FinancialYear
from app.models.return_note import ReturnNote, ReturnNoteItem

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
    "VAParty",
    "SupplierInvoice",
    "PurchaseItem",
    "JobChallan",
    "BatchChallan",
    "BatchProcessing",
    "Customer",
    "Broker",
    "Transport",
    "LedgerEntry",
    "Company",
    "UserCompany",
    "Shipment",
    "ShipmentItem",
    "FinancialYear",
    "ReturnNote",
    "ReturnNoteItem",
]
