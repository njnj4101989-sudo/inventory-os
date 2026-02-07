"""Order service — lifecycle: create, ship, cancel, return."""

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.order import Order
from app.models.order_item import OrderItem
from app.schemas.order import OrderCreate, ReturnRequest, OrderResponse
from app.schemas import PaginatedParams


class OrderService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_orders(self, params: PaginatedParams) -> dict:
        """List orders with pagination + filters (status, source). Returns {items, total, page, pages}."""
        raise NotImplementedError

    async def get_order(self, order_id: UUID) -> OrderResponse:
        """Get single order with items. Raises NotFoundError."""
        raise NotImplementedError

    async def create_order(self, req: OrderCreate, created_by: UUID) -> dict:
        """Create order + reserve stock for each item.

        Steps:
        1. Generate next_order_number via core/code_generator
        2. Create Order record (status=PENDING)
        3. Create OrderItem records
        4. Create Reservations for each item via reservation_service
        5. Calculate total_amount
        6. Return {order: OrderResponse, reservations: list}
        Raises: InsufficientStockError if any SKU unavailable.
        """
        raise NotImplementedError

    async def ship_order(self, order_id: UUID, user_id: UUID) -> dict:
        """Ship order → generate invoice + STOCK_OUT events.

        Steps:
        1. Validate order status == PENDING or PROCESSING
        2. Confirm all reservations
        3. Create STOCK_OUT inventory events per item
        4. Generate invoice via invoice_service
        5. Update order status → SHIPPED
        6. Return {order, invoice, events}
        Raises: NotFoundError, InvalidStateTransitionError.
        """
        raise NotImplementedError

    async def cancel_order(self, order_id: UUID, user_id: UUID) -> dict:
        """Cancel order → release reservations.

        Steps:
        1. Validate order status allows cancellation
        2. Release all active reservations
        3. Update order status → CANCELLED
        4. Return {order, events}
        Raises: NotFoundError, InvalidStateTransitionError.
        """
        raise NotImplementedError

    async def return_order(self, order_id: UUID, req: ReturnRequest, user_id: UUID) -> dict:
        """Process return → RETURN inventory events.

        Steps:
        1. Validate order was SHIPPED
        2. Create RETURN inventory events per returned item
        3. Update fulfilled_qty on order items
        4. Return {order, events}
        Raises: NotFoundError, InvalidStateTransitionError, ValidationError.
        """
        raise NotImplementedError
