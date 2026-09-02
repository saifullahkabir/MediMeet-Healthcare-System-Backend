import dotenv from "dotenv";
// biome-ignore lint/style/useNodejsImportProtocol: <explanation>
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  node_env: process.env.NODE_ENV,
  port: Number(process.env.PORT),
  database_url: process.env.DATABASE_URL,
  app_url: process.env.APP_URL,
  frontend_url: process.env.FRONTEND_URL,
  bcrypt_salt_rounds: Number(process.env.BCRYPT_SALT_ROUNDS),
  jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,
  google_client_id: process.env.GOOGLE_CLIENT_ID!,
  super_admin_name: process.env.SUPER_ADMIN_NAME as string,
  super_admin_email: process.env.SUPER_ADMIN_EMAIL as string,
  super_admin_password: process.env.SUPER_ADMIN_PASSWORD as string,
};
