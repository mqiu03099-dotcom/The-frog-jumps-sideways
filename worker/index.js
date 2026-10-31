import { handleApi } from "./api.js";

// /api/* 走后端，其余交给静态落地页
export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
