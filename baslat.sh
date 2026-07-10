#!/bin/bash
set -e

echo " Stok Takip kurulumu başlıyor..."

# Backend kurulum
echo ""
echo " Backend bağımlılıkları yükleniyor..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt -q
echo " Backend hazır."

# Frontend kurulum
echo ""
echo "...️  Frontend bağımlılıkları yükleniyor ..."
cd ../frontend
npm install -q
echo " Frontend hazır."

echo ""
echo " Uygulama başlatılıyor..."
echo "   Backend: http://localhost:5050"
echo "   Frontend: http://localhost:3000"
echo ""
echo "Durdurmak için Ctrl+C"

# Backend'i arka planda başlat
cd ../backend
source venv/bin/activate
python run.py &
BACKEND_PID=$!

# Frontend'i başlat
cd ../frontend
npm start

# Frontend kapanınca backend'i de durdur
kill $BACKEND_PID 2>/dev/null
