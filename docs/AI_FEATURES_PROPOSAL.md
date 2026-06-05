# De xuat tinh nang AI cho mini-app Nha Tien Tri

Tai lieu nay tong hop 5 tinh nang AI phu hop voi mini-app **Nha Tien Tri**. Muc tieu la tang do vui, tang retention va giam cong van hanh cho BTC, nhung van giu scope thuc te de co the build theo tung giai doan.

## 1. AI Nhan Dinh Tran Dau

AI tao preview ngan cho tung tran: doi manh/yếu, chenh FIFA rank, kha nang hoa, "keo an toan" va "keo lieu".

Vi du:

> Mexico vs Nam Phi: Mexico manh hon ro theo FIFA rank, nhung tran mo man de cang. Keo an toan: Mexico thang sat nut. Keo lieu: hoa 1-1.

### Loi ich

- Tang hung thu truoc khi nguoi choi dua ra du doan.
- De build neu chi dung du lieu co san: doi bong, FIFA rank, lich dau, bang dau.
- Phu hop voi tinh than game noi bo, khong can qua nghiem tuc nhu san pham ca cuoc.

### Trade-off

- Neu chi dung du lieu noi bo, nhan dinh se kha tong quat.
- Neu muon nhan dinh sau hon can them du lieu phong do, chan thuong, tin tuc; viec nay ton API/data va de sai.
- Can ghi ro day la noi dung tham khao vui, tranh tao cam giac AI dua ra ket qua chac chan.

## 2. AI Goi Y Du Doan Ca Nhan

AI phan tich lich su du doan cua tung nguoi choi: hay chon doi manh, hay doan it ban, ti le dung ket qua/dung ti so. Sau do dua ra goi y cach choi.

Vi du:

> Ban thuong doan it ban va dung ket qua kha on. Tran nay nen chon 2-1 thay vi 1-0 neu muon tang co hoi dung ti so.

### Loi ich

- Tao cam giac ca nhan hoa, app "hieu" nguoi choi.
- Giup nguoi choi moi co diem tua khi khong ranh bong da.
- Co the bien thanh mot "AI coach" vui, tang ly do quay lai app.

### Trade-off

- Dau giai chua co du du lieu lich su nen goi y se yeu.
- Co nguy co lam game bot tinh "tu phan" neu AI goi y qua truc tiep.
- Can tranh auto-pick; nen giu AI o vai tro goi y, khong thay nguoi choi ra quyet dinh.

## 3. AI Tao Cau Hoi Vui Hang Ngay Cho BTC

BTC bam mot nut, AI de xuat 5-10 cau hoi vui dua tren lich tran trong ngay: chan/le tong ban, doi nao ghi nhieu ban nhat, co the do khong, tran nao nhieu ban nhat.

### Loi ich

- Giam cong van hanh hang ngay cho BTC.
- Cau hoi da dang hon, it bi lap.
- Keo duoc ca nguoi khong me bong da tham gia, dung voi muc tieu san pham.

### Trade-off

- AI co the tao cau hoi mo ho, kho cham, hoac khong phu hop voi lich tran that.
- Van can BTC duyet truoc khi publish.
- Nen de AI tao ban nhap, khong cho AI tu dong tao/chot cau hoi truc tiep.

## 4. AI Tong Ket Ngay Thi Dau

Sau moi ngay, AI tao recap noi bo: ai leo hang, ai tut hang, ai an exact, ai dat keo tu thanh cong, tran nao lam dao BXH.

Vi du:

> Hom nay Minh leo 5 bac nho cu exact 2-1. Lan mat top 1 vi dat keo tu sai tran Brazil - Morocco. BXH dang rat sat: top 3 chi cach nhau 4 diem.

### Loi ich

- Rat hop muc tieu engagement va tao cau chuyen noi bo.
- Dung du lieu noi bo nen it phu thuoc nguon ngoai.
- Co the bien thanh notification, post recap, hoac card trong tab BXH.

### Trade-off

- Can kiem soat tone de khong "ca khia" qua da.
- Neu gui push qua nhieu se gay phien.
- Nen gioi han 1 recap/ngay va cho BTC duyet truoc khi gui.

## 5. AI Hoi Dap BXH Va Chien Thuat

Nguoi choi co the hoi bang tieng Viet:

- "Toi con co hoi vao top 3 khong?"
- "Ai dang co streak tot nhat?"
- "Tran nao sap toi anh huong BXH nhieu nhat?"
- "Toi nen choi an toan hay lieu hom nay?"

AI tra loi dua tren leaderboard, predictions da khoa, lich tran va diem hien tai.

### Loi ich

- Tao trai nghiem AI-native ro rang, khac voi bang diem thong thuong.
- Tang tinh kham pha du lieu trong app.
- Phu hop de lam thanh tro ly noi bo cua giai.

### Trade-off

- Phuc tap hon vi AI phai doc du lieu co cau truc va tinh toan dung.
- Can guardrail de khong tiet lo du doan cua nguoi khac truoc gio khoa.
- Can kiem soat hallucination: AI khong duoc bia diem, bia rank, bia tran dau.

## Uu Tien De Build

Nen uu tien theo thu tu:

1. **AI tong ket ngay thi dau**
2. **AI tao cau hoi vui cho BTC**
3. **AI nhan dinh tran dau**
4. **AI goi y du doan ca nhan**
5. **AI hoi dap BXH va chien thuat**

Ba tinh nang dau it rui ro, de demo va tang gia tri nhanh. Hai tinh nang sau ca nhan hoa sau hon, nhung can du lieu, permission va guardrail tot hon.

