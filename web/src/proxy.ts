import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const AUTH_PAGES = ["/login", "/setup"];

export async function proxy(request: NextRequest) {
  // Mock demo：无真实登录，放行所有页面（客户端 auth 守卫也会放行）。
  if (process.env.NEXT_PUBLIC_MOCK === "1") return NextResponse.next();

  // Pages served by Next dev must pass the same gate as the embedded UI.
  // Only send credentials to a loopback backend; never follow redirects.
  // Remote dev backends remain usable when their optional gate is disabled.
  let gate: Response;
  try {
    const backend = new URL(process.env.AUTOPENTEST_API ?? "http://localhost:8787");
    if (!["http:", "https:"].includes(backend.protocol) || backend.username || backend.password) {
      return new NextResponse("认证后端地址配置无效", { status: 503 });
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname);
    gate = await fetch(new URL("/api/basic-auth/check", backend), {
      headers: local
        ? {
            cookie: request.headers.get("cookie") ?? "",
            authorization: request.headers.get("authorization") ?? "",
            "x-forwarded-proto": request.nextUrl.protocol.replace(":", ""),
          }
        : {},
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!local && gate.status === 401) {
      return new NextResponse("远程后端已启用 HTTP Basic Auth，请通过内嵌前端访问该服务", { status: 503 });
    }
  } catch {
    return new NextResponse("认证服务暂时不可用，请稍后重试", { status: 503 });
  }
  if (!gate.ok) {
    const headers = new Headers({ "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" });
    const challenge = gate.headers.get("www-authenticate");
    if (challenge) headers.set("WWW-Authenticate", challenge);
    return new NextResponse(gate.status === 401 ? "请完成 HTTP Basic Auth 验证后刷新页面" : "认证服务暂时不可用", {
      status: gate.status,
      headers,
    });
  }
  const finish = (response: NextResponse) => {
    const cookie = gate.headers.get("set-cookie");
    if (cookie) response.headers.append("Set-Cookie", cookie);
    response.headers.set("Cache-Control", "no-store");
    return response;
  };

  const { pathname } = request.nextUrl;
  const token = request.cookies.get("artex_token")?.value;
  const isAuthPage = AUTH_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // 未登录 → 跳转登录页
  if (!token && !isAuthPage) {
    return finish(NextResponse.redirect(new URL("/login", request.url)));
  }

  // 已登录时访问登录/初始化页 → 跳转主界面
  if (token && isAuthPage) {
    return finish(NextResponse.redirect(new URL("/function/tasks", request.url)));
  }

  return finish(NextResponse.next());
}

export const config = {
  // 跳过 Next.js 内部路由、API 路由、favicon 及 public/ 下的静态文件（含图片、字体等）
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf)$).*)",
  ],
};
