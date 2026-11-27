import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = "https://openapi.koreainvestment.com:9443"
key = os.environ["KIS_APP_KEY"]
secret = os.environ["KIS_APP_SECRET"]

def call(path, headers, body=None):
    request = Request(BASE + path, headers=headers, data=None if body is None else json.dumps(body).encode())
    try:
        with urlopen(request, timeout=12) as response:
            return json.load(response)
    except HTTPError as error:
        raise SystemExit(f"KIS HTTP {error.code}") from None
    except (URLError, TimeoutError):
        raise SystemExit("KIS 연결 실패") from None

auth = call("/oauth2/tokenP", {"Content-Type": "application/json"},
            {"grant_type": "client_credentials", "appkey": key, "appsecret": secret})
token = auth.get("access_token")
if not token:
    raise SystemExit("KIS 토큰 미발급")
print("KIS REST 인증 성공")

checks = (
    ("004370", "/uapi/domestic-stock/v1/quotations/inquire-price", "FHKST01010100",
     {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": "004370"}, "stck_prpr"),
    ("KO", "/uapi/overseas-price/v1/quotations/price", "HHDFS00000300",
     {"AUTH": "", "EXCD": "NYS", "SYMB": "KO"}, "last"),
)
failed = False
for symbol, path, transaction, query, price_field in checks:
    result = call(path + "?" + urlencode(query),
                  {"authorization": "Bearer " + token, "appkey": key, "appsecret": secret,
                   "tr_id": transaction, "custtype": "P"})
    ok = result.get("rt_cd") == "0" and bool(result.get("output", {}).get(price_field))
    print(f"{symbol} 현재가 {'확인' if ok else '미확인'}")
    failed |= not ok

approval = call("/oauth2/Approval", {"Content-Type": "application/json"},
                {"grant_type": "client_credentials", "appkey": key, "secretkey": secret})
approved = bool(approval.get("approval_key"))
print("KIS WebSocket 접속키 " + ("발급" if approved else "미발급"))
raise SystemExit(failed or not approved)
