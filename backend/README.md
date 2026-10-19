# Atelier API

Минимальный API для проектов Atelier. Сейчас он хранит проекты в JSON и загруженные файлы локально; это базовый слой перед подключением базы данных, object storage и IFC-воркера.

```bash
cd backend
npm start
```

Проверка:

```bash
curl http://localhost:8787/api/health
curl -X POST http://localhost:8787/api/projects -H 'content-type: application/json' -d '{"name":"Дом у леса"}'
```

Загрузка файла выполняется сырым телом запроса, имя передаётся в `x-file-name`:

```bash
curl -X POST http://localhost:8787/api/projects/PROJECT_ID/files \
  -H 'x-file-name: house.ifc' \
  -H 'content-type: application/octet-stream' \
  --data-binary @house.ifc
```
