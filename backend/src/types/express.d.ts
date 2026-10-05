declare namespace Express {
  interface Request {
    // apiKeyId is set only when the caller authenticated with an API key (not a JWT).
    // email is the JWT claim (absent for API keys); only checkout needs it.
    user?: { id: string; apiKeyId?: string; email?: string };
  }
}
