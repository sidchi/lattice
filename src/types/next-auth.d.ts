import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      /** Our `User.id`, set by the jwt callback at sign-in (not the Google subject id). */
      id: string;
      email: string;
    } & Omit<NonNullable<DefaultSession["user"]>, "email">;
  }
}
