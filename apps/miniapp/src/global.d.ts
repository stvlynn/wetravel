declare const defineAppConfig: <T>(config: T) => T;
declare const definePageConfig: <T>(config: T) => T;

declare namespace NodeJS {
  interface ProcessEnv {
    TARO_APP_API_BASE_URL?: string;
  }
}
