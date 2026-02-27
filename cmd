#首次使用docker
docker compose -f docker-compose.yml up -d
#


#修改的前端后重启
cd /home/xier/ragflow./ragflow_web
npm run build

cd /home/xier/ragflow./docker
sudo docker compose -f docker-compose.yml down
sudo docker compose -f docker-compose.yml up -d


#修改的前端后重启
cd /mnt/cfs/zhangjiyuan/ragflow./ragflow_web
npm install
npm run build

cd /mnt/cfs/zhangjiyuan/ragflow./docker
docker compose -f docker-compose.yml down
docker compose -f docker-compose.yml up -d




git fetch origin
git checkout main
git reset --hard origin/main