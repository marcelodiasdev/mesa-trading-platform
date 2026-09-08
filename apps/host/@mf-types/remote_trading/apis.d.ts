
    export type RemoteKeys = 'remote_trading/Panel';
    type PackageType<T> = T extends 'remote_trading/Panel' ? typeof import('remote_trading/Panel') :any;