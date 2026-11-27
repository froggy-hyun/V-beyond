import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE = "https://openapi.koreainvestment.com:9443"
key = os.environ["KIS_APP_KEY"]
secret = os.environ["KIS_APP_SECRET"]
token = os.environ.get("KIS_ACCESS_TOKEN")
if not token:
    raise SystemExit("유효한 KIS_ACCESS_TOKEN을 환경 변수로 전달해 주세요.")

def call(path, headers):
    request = Request(BASE + path, headers=headers)
    try:
        with urlopen(request, timeout=12) as response:
            return json.load(response)
    except HTTPError as error:
        raise SystemExit(f"KIS HTTP {error.code}") from None
    except (URLError, TimeoutError):
        raise SystemExit("KIS 연결 실패") from None

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

raise SystemExit(failed)
