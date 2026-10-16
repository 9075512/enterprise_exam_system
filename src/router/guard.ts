import type { NavigationGuard, Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { usePermissionsStore } from '@/stores/permissions';
import { getHomePath } from '@/layouts/menuConfig';
import type { Role } from '@/types';

/** Redirect only to pages the current user can actually enter. */
export function createAuthGuard(router: Router): NavigationGuard {
  return async (to) => {
    const auth = useAuthStore();
    if (auth.initializing) await auth.fetchMe();
    if (!auth.currentUser) {
      return to.meta.public ? true : { path: '/login', query: { redirect: to.fullPath } };
    }

    const permissions = usePermissionsStore();
    await permissions.load();
    // A 401 while fetching permissions may have cleared the session.
    const user = auth.currentUser;
    if (!user) return to.meta.public ? true : '/login';
    const canEnter = (meta: Record<string, unknown>) => {
      const roles = meta.roles as Role[] | undefined;
      return (!roles || roles.includes(user.role))
        && (!meta.menuKey || permissions.hasMenu(meta.menuKey as string, user.role));
    };
    const available = router.getRoutes().filter((route) =>
      route.meta.menuKey && !route.path.includes(':') && canEnter(route.meta),
    );
    const home = available.find((route) => route.path === getHomePath(user.role))?.path
      ?? available[0]?.path ?? '/no-access';

    if (to.meta.public || !canEnter(to.meta)) return home;
    return true;
  };
}
