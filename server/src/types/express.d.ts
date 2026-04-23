declare namespace Express {
  interface Request {
    user?: {
      id: number;
      username: string;
      real_name: string;
      role: string;
    };
  }
}
