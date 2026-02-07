"""QR code generation service."""

import io
import base64


class QRService:
    @staticmethod
    def generate_qr_base64(data: str) -> str:
        """Generate a QR code as a base64-encoded PNG string.

        Uses the qrcode library (in requirements.txt).
        Returns: "data:image/png;base64,..." string.
        """
        raise NotImplementedError

    @staticmethod
    def generate_batch_qr(batch_code: str) -> str:
        """Generate QR code data string for a batch label.

        Format: JSON string with batch_code for scanner to parse.
        Returns the base64 QR image.
        """
        raise NotImplementedError
