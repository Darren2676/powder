declare namespace Express {
  interface Request {
    user?: {
      id: number;
      username: string;
      real_name: string;
      role: string;
      default_factory_id?: number | null;
      accessibleFactories?: Array<{
        id: number;
        factory_code: string;
        factory_name: string;
        factory_short?: string;
      }>;
    };
    factoryScope?: {
      mode: 'all' | 'single';
      factory_id?: number | null;
      filter: boolean;
      accessibleFactories?: number[];
    };
  }
}
