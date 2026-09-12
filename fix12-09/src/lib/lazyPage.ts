import { lazy, type ComponentType } from "react";

export function lazyNamed<TModule extends Record<string, unknown>>(factory: () => Promise<TModule>, exportName: keyof TModule) {
  return lazy(async () => {
    const module = await factory();
    return { default: module[exportName] as ComponentType<any> };
  });
}
