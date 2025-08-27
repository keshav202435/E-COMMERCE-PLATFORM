# Shop With Singh – Dockerized Fullstack App

## Quick Start

1. Place these files as shown above in your project root:
   - index.js
   - Dockerfile
   - docker-compose.yml
   - public/logo.svg

2. Ensure Docker and Docker Compose are installed.

3. Build and run everything:
   ```
   docker compose up --build -d
   ```

4. Visit [http://localhost:5000](http://localhost:5000)

## Default Admin Login

- Email: `admin@shopwithsingh.com`
- Password: `admin123`

## Notes

- For production, change `JWT_SECRET` in docker-compose.yml.
- For cloud MongoDB (Atlas), update `MONGO_URI`.
- Use a reverse proxy (e.g. Nginx) + HTTPS for public deployments.