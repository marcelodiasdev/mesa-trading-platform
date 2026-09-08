import type { SessionUser } from "../store/slices/session";

const DEMO_USER: SessionUser = {
  userId: "11111111-1111-4111-8111-111111111111",
  displayName: "Marcelo Dias",
  accounts: ["22222222-2222-4222-8222-222222222222"],
};

const DEMO_TOKEN = "demo-token";

export async function signIn(): Promise<SessionUser> {
  return DEMO_USER;
}

export async function getToken(): Promise<string | null> {
  return DEMO_TOKEN;
}
