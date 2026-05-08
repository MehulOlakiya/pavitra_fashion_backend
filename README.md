# Pavitra Fashion — NestJS Backend

## Tech Stack

- **NestJS** (Node.js framework)
- **MongoDB** via **Mongoose**
- **JWT** authentication (passport-jwt)
- **bcrypt** password hashing
- **class-validator** request validation

## Project Structure

```
src/
├── main.ts               # Entry point, CORS, global pipes
├── app.module.ts         # Root module (MongoDB, Auth, Users)
├── seed.ts               # One-time DB seeder for default admin
│
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── dto/login.dto.ts
│   └── strategies/jwt.strategy.ts
│
├── users/
│   ├── users.module.ts
│   ├── users.service.ts
│   └── schemas/user.schema.ts
│
└── common/
    └── guards/jwt-auth.guard.ts
```

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

| Variable         | Description                       | Default                                     |
| ---------------- | --------------------------------- | ------------------------------------------- |
| `MONGODB_URI`    | MongoDB connection string         | `mongodb://localhost:27017/pavitra_fashion` |
| `JWT_SECRET`     | Secret key for signing JWT tokens | _(change in production)_                    |
| `JWT_EXPIRES_IN` | Token expiry duration             | `8h`                                        |
| `PORT`           | HTTP server port                  | `3000`                                      |

### 3. Seed the default admin user

```bash
npm run seed
```

This creates the user `pavitra.fashion@gamail.com` / `Pavitra@1234`.

### 4. Run in development mode

```bash
npm run start:dev
```

## API Reference

### POST `/api/auth/login`

Authenticates a user and returns a JWT.

**Request body**

```json
{
  "email": "pavitra.fashion@gamail.com",
  "password": "Pavitra@1234"
}
```

**Success response (200)**

```json
{
  "accessToken": "<jwt_token>",
  "user": {
    "id": "...",
    "name": "Pavitra Admin",
    "email": "pavitra.fashion@gamail.com",
    "role": "admin"
  }
}
```

**Error response (401)**

```json
{
  "statusCode": 401,
  "message": "Invalid email or password."
}
```

## Protecting routes with JWT

Import `JwtAuthGuard` and apply it with `@UseGuards(JwtAuthGuard)`:

```typescript
import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";

@Controller("dashboard")
export class DashboardController {
  @UseGuards(JwtAuthGuard)
  @Get()
  getData() {
    return { message: "Protected data" };
  }
}
```
