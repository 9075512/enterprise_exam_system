import type { NavigationGuard, Router } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { usePermissionsStore } from '@/stores/permissions';
import { getHomePath } from '@/layouts/menuConfig';
import type { Role } from '@/types';
import { isLearnerAndroidApp } from '@/utils/appClient';

/** Redirect only to pages the current user can actually enter. */
export function createAuthGuard(router: Router): NavigationGuard {
  return async (to) => {
    // 下载页对已登录用户同样可见，也不依赖会话恢复或菜单接口。
    if (to.meta.public && to.meta.standalone) return true;
    const auth = useAuthStore();
    if (auth.initializing) await auth.fetchMe();
    if (!auth.currentUser) {
      return to.meta.public ? true : { path: '/login', query: { redirect: to.fullPath } };
    }

    // 安卓客户端仅面向学员，管理端仍通过网页使用。
    // 真正的数据权限由服务端校验，UA 只决定客户端入口。
    if (isLearnerAndroidApp() && auth.currentUser.role !== 'examinee') {
      auth.logout();
      return { path: '/login', query: { learnerOnly: '1' } };
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
