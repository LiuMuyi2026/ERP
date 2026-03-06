/**
 * Module Registry — Frontend module system.
 *
 * Fetches module manifests from the backend and provides
 * a unified API for navigation, permissions, and module state.
 */

import { api } from './api';

export interface ModuleMenuItem {
  label: string;
  path: string;
  icon: string;
  sort: number;
  module: string;
  module_name: string;
}

export interface ModuleInfo {
  slug: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  depends: string[];
  installed: boolean;
  has_routes: boolean;
  permissions: string[];
  menu_items: ModuleMenuItem[];
}

let _modulesCache: ModuleInfo[] | null = null;
let _menuCache: ModuleMenuItem[] | null = null;

/**
 * Fetch all registered modules from backend.
 */
export async function fetchModules(): Promise<ModuleInfo[]> {
  if (_modulesCache) return _modulesCache;
  try {
    const modules = await api.get<ModuleInfo[]>('/api/modules');
    _modulesCache = modules;
    return modules;
  } catch {
    return [];
  }
}

/**
 * Fetch the complete navigation menu from all installed modules.
 */
export async function fetchNavMenu(): Promise<ModuleMenuItem[]> {
  if (_menuCache) return _menuCache;
  try {
    const items = await api.get<ModuleMenuItem[]>('/api/navigation/menu');
    _menuCache = items;
    return items;
  } catch {
    return [];
  }
}

/**
 * Invalidate caches (call after module install/uninstall).
 */
export function invalidateModuleCache() {
  _modulesCache = null;
  _menuCache = null;
}

/**
 * Check if a module is installed.
 */
export function isModuleInstalled(modules: ModuleInfo[], slug: string): boolean {
  return modules.some(m => m.slug === slug && m.installed);
}
