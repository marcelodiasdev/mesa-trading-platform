
    export type RemoteKeys = 'remote_portfolio/Panel';
    type PackageType<T> = T extends 'remote_portfolio/Panel' ? typeof import('remote_portfolio/Panel') :any;