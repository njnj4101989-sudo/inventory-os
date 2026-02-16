"""QR code generation service."""

import io
import json
import base64


class QRService:
    @staticmethod
    def generate_qr_base64(data: str) -> str:
        try:
            import qrcode
            qr = qrcode.QRCode(version=1, box_size=10, border=4)
            qr.add_data(data)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            buffer = io.BytesIO()
            img.save(buffer, format="PNG")
            b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")
            return f"data:image/png;base64,{b64}"
        except ImportError:
            # qrcode package not installed — return placeholder
            return f"data:text/plain;base64,{base64.b64encode(data.encode()).decode()}"

    @staticmethod
    def generate_batch_qr(batch_code: str) -> str:
        data = json.dumps({"batch_code": batch_code, "type": "batch"})
        return QRService.generate_qr_base64(data)
