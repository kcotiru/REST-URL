declare namespace Express {
  interface Request {
    // apiKeyId is set only when the caller authenticated with an API key (not a JWT).
    user?: { id: string; apiKeyId?: string };
  }
}
