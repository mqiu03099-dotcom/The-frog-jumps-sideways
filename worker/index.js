import { handleApi } from "./api.js";

// /api/* 走后端，其余交给静态落地页
export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return handleApi(request, env);
    }

    if (pathname === "/googlec0b1348d6b9cc6f8.html") {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/googlec0b1348d6b9cc6f8";
      return env.ASSETS.fetch(new Request(assetUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};
