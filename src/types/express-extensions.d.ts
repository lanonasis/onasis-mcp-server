import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      apiKey?: string;
      user?: {
        id: string;
        email?: string;
        organizationId?: string;
      };
      organization?: {
        id: string;
        name?: string;
        plan?: string;
      };
    }
  }
}

export {};