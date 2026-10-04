# 🌧️ Số giờ mưa hằng ngày – Phường Xuân Hương, Đà Lạt

Ứng dụng web theo dõi **số giờ có mưa mỗi ngày** tại khu vực hồ Xuân Hương (11.942°N, 108.447°E).
Kho lịch sử được **GitHub Actions tự ghi mỗi ngày**, nên không phụ thuộc vào trình duyệt hay máy tính nào.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html` | Giao diện: hôm nay, thống kê, biểu đồ, nhật ký theo tháng, xuất CSV |
| `scripts/cap-nhat-mua.mjs` | Script lấy số giờ mưa từ Open-Meteo và ghi vào kho |
| `.github/workflows/cap-nhat-mua.yml` | Lịch chạy tự động lúc **00:30 giờ Việt Nam** mỗi ngày |
| `data/so-gio-mua.json` | Kho lịch sử (tự sinh) – trang web đọc file này |
| `data/so-gio-mua.csv` | Bản CSV của kho (mở bằng Excel) |

## Cài đặt (một lần, ~5 phút)

1. **Tạo repo** mới trên GitHub (ví dụ `so-gio-mua-xuan-huong`), chế độ *Public* (Pages miễn phí) hoặc *Private*.
2. **Tải toàn bộ nội dung thư mục này lên repo** (giữ nguyên thư mục `.github/`, `scripts/`):
   - Cách dễ nhất: trên trang repo bấm **Add file → Upload files**, kéo thả tất cả file/thư mục vào.
   - Hoặc dùng Git:
     ```powershell
     git init
     git add .
     git commit -m "Khởi tạo ứng dụng số giờ mưa"
     git branch -M main
     git remote add origin https://github.com/<tai-khoan>/<ten-repo>.git
     git push -u origin main
     ```
3. **Cho phép Actions ghi vào repo:** *Settings → Actions → General → Workflow permissions* → chọn **Read and write permissions** → *Save*.
4. **Chạy lần đầu:** tab **Actions** → *Cập nhật số giờ mưa hằng ngày* → **Run workflow**.
   - Để trống ô ngày → lấy 92 ngày gần nhất.
   - Muốn có lịch sử dài hơn, nhập ngày bắt đầu, ví dụ `2020-01-01` (ECMWF IFS từ 2017; trước đó dùng ERA5-Land, có từ 1950).
   Sau khi chạy xong, repo sẽ có thư mục `data/` với file JSON và CSV.
5. **(Khuyến nghị) Bật GitHub Pages** để xem ứng dụng ở mọi nơi:
   *Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)`* → *Save*.
   Vài phút sau truy cập: `https://<tai-khoan>.github.io/<ten-repo>/`

Từ đó trở đi, mỗi ngày lúc ~00:30 GitHub tự thêm số giờ mưa của ngày hôm trước vào kho.

## Mở trực tiếp `index.html` trên máy (không dùng Pages)

Trình duyệt không cho trang mở bằng `file://` đọc file cục bộ, nên hãy khai báo địa chỉ raw của kho
trong `index.html` (mục `historyUrls` trong `CFG`):

```js
historyUrls: [
  'data/so-gio-mua.json',
  'https://raw.githubusercontent.com/<tai-khoan>/<ten-repo>/main/data/so-gio-mua.json',
],
```

> Cách này chỉ dùng được với repo **Public**.

## Ghi chú

- “Số giờ mưa” = số giờ trong ngày có lượng mưa ≥ 0,1 mm; “khung giờ mưa” = các giờ có mưa liên tục
  (ví dụ `13:00-17:00`), theo giờ Việt Nam. Đây là số liệu **mô hình thời tiết** cho toạ độ trên, không phải trạm đo tại chỗ.
- Nguồn kho: Open-Meteo Historical Weather API, mô hình **ECMWF IFS HRES 9 km** (mưa từng giờ, có từ 2017, cập nhật
  mỗi 6 giờ). Ngày trước 2017 dùng ERA5-Land. Cột `nguon`: `ecmwf_ifs` hoặc `era5_land`.
- Mỗi ngày trong kho gồm `hours` (số giờ mưa), `mm` (tổng lượng mưa) và `periods` = `[giờ bắt đầu, giờ kết thúc, mm]`.
  7 ngày gần nhất được ghi đè mỗi lần chạy để nhận số liệu hiệu chỉnh.
- Muốn đối chiếu với số đo thực tế: trạm đo mưa tự động trên [Vrain](https://vrain.vn) (WATEC) và trạm khí tượng
  Đà Lạt của Trung tâm Dự báo KTTV Quốc gia – hai nguồn này chưa có API công khai nên không tự động lấy được.
- Lịch chạy của GitHub có thể trễ vài phút đến vài chục phút. Nếu lỡ một ngày cũng không sao: mỗi lần chạy
  đều quét lại 92 ngày gần nhất và điền các ngày còn thiếu.
- Với repo Public, GitHub tự tắt lịch chạy nếu repo **không có hoạt động trong 60 ngày**. Nếu thấy tab Actions báo
  workflow bị tắt, bấm **Enable workflow** để bật lại.
- Chạy thử script trên máy (cần Node.js 18+): `node scripts/cap-nhat-mua.mjs`
