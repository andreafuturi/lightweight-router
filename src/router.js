let linkData = {};
let debugMode = false;
const log = (...args) => debugMode && console.log("🚦 Router:", ...args);
const handlePopState = async () => {
  log("Navigation triggered to:", globalThis.location.pathname);
  document.body.classList.add("loading");
  const currentPath = globalThis.location.pathname.replace(/\/$/, ""); // Normalize path by removing trailing slash
  const router = document.querySelector("router");

  let currentRoute = router.querySelector(`route[path="${currentPath}"]`);

  // If the route doesn't exist in DOM, create and append it
  if (!currentRoute) {
    log("Creating new route element for:", currentPath);
    currentRoute = document.createElement("route");
    currentRoute.setAttribute("path", currentPath);
    router.appendChild(currentRoute);
  }

  // Only fetch and render content if the route is empty
  if (!currentRoute.innerHTML) {
    log("Fetching content for:", globalThis.location.href);
    let content = linkData[globalThis.location.href];

    // Fetch content if it's not already cached
    if (!content) {
      content = await fetchContent(globalThis.location.href);
      linkData[globalThis.location.href] = content;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");

    // Update the page title with the new content's title
    const newTitle = doc.querySelector("title");
    if (newTitle) {
      log("Updating page title to:", newTitle.textContent);
      document.title = newTitle.textContent;
    }

    currentRoute.innerHTML = doc.body.innerHTML;

    // Execute scripts from the fetched content
    const scripts = Array.from(currentRoute.querySelectorAll("script"));
    log("Executing", scripts.length, "scripts from fetched content");
    for (const oldScript of scripts) {
      const newScript = document.createElement("script");
      if (oldScript.src) {
        newScript.src = oldScript.src;
      } else {
        newScript.textContent = oldScript.textContent;
      }
      oldScript.parentNode.replaceChild(newScript, oldScript);
    }
  }

  // Display only the current route
  router.querySelectorAll("route").forEach(route => (route.style.contentVisibility = "hidden"));
  currentRoute.style.contentVisibility = "visible";

  document.body.classList.remove("loading");
  window.scrollTo(0, 0);

  // Call the route change handler if it's set
  if (onRouteChange) onRouteChange(currentPath);
  log("Route change completed");
};

//link management

const fetchAndSaveContent = async link => {
  if (!linkData[link.href]) {
    log("Prefetching content for:", link.href);
    linkData[link.href] = await fetchContent(link.href);
  }
};

const handleLinkIntersection = (entries, observer) => {
  log("🔍 Intersection Observer triggered for", entries.length, "entries");
  entries.forEach(entry => {
    const link = entry.target;
    log(`🎯 Link ${link.href} intersection:`, {
      isIntersecting: entry.isIntersecting,
      intersectionRatio: entry.intersectionRatio,
      alreadyCached: !!linkData[link.href],
    });

    if (entry.isIntersecting) {
      if (!linkData[link.href]) {
        fetchAndSaveContent(link);
        log("👁️ Unobserving link after prefetch initiated:", link.href);
        observer.unobserve(link);
      } else {
        log("📦 Content already cached for:", link.href);
      }
    }
  });
};

const handleLinkHover = async event => {
  const link = event.target;
  if (!linkData[link.href] && isInternalLink(link.href)) {
    await fetchAndSaveContent(link);
  }
};

const handleLinkClick = e => {
  const link = e.target.closest("A");
  if (!link || !link.href || !isInternalLink(link.href) || link.origin !== location.origin) {
    log("Invalid link click:", link?.href);
    return;
  }
  log("Internal link clicked:", link.href);
  e.preventDefault();
  globalThis.history.pushState(null, null, link.href);
  globalThis.dispatchEvent(new Event("popstate"));
};

const observeLinks = observer => {
  const saveDataOn = navigator.connection && navigator.connection.saveData;
  const links = document.querySelectorAll("a");

  log("🔄 Starting link observation...", {
    totalLinks: links.length,
    saveDataMode: saveDataOn,
  });

  links.forEach(link => {
    const shouldObserve = link.getAttribute("prefetch") !== "onHover" && !saveDataOn && isInternalLink(link.href);

    log("🔗 Link evaluation:", {
      href: link.href,
      prefetchAttr: link.getAttribute("prefetch"),
      isInternal: isInternalLink(link.href),
      willObserve: shouldObserve,
    });

    if (shouldObserve) {
      observer.observe(link);
      log("👀 Now observing link:", link.href);
    }
  });
};

function isInternalLink(href) {
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return false;
  if (href.startsWith("/")) return true;

  try {
    const url = new URL(href, window.location.origin);
    const currentUrl = new URL(window.location.href);

    const currentHost = currentUrl.hostname.replace(/^www\./, "");
    const targetHost = url.hostname.replace(/^www\./, "");

    // Compare hosts
    if (currentHost !== targetHost) return false;

    // Compare paths (ignoring parameters and fragments)
    const currentPath = currentUrl.pathname;
    const targetPath = url.pathname;

    return currentPath !== targetPath || !url.hash;
  } catch {
    return false;
  }
}

let onRouteChange;

const setRouteChangeHandler = handler => {
  onRouteChange = handler;
};

const fetchContent = async url => {
  const response = await fetchWithFallback(url);
  if (!response.ok) {
    return `Couldn't fetch the route - HTTP error! status: ${response.status}`;
  }
  return await response.text();
};

// Updated fetchWithFallback to check the flag
const fetchWithFallback = async url => {
  if (!routerCreatedManually) {
    const res = await fetch(url, { method: "POST", body: "onlyRoute" });
    if (res.ok) return res;
  }
  return await fetch(url);
};

let routerCreatedManually = false;
const startRouter = (options = {}) => {
  const { onRouteChange, debug } = options;
  debugMode = debug;
  log("Router starting...", options);
  if (onRouteChange) setRouteChangeHandler(onRouteChange);
  const style = document.createElement("style");
  style.textContent = `
      .loading {
          animation: pulse 1s infinite alternate;
      }
      @keyframes pulse {
          from { opacity: 0.6; }
          to { opacity: 0.1; }
      }
      route {
        content-visibility: auto;
      }
  `;
  document.head.appendChild(style);

  let router = document.querySelector("router");
  const currentPath = globalThis.location.pathname;

  if (!router) {
    log("Creating new router element");
    router = document.createElement("router");
    const route = document.createElement("route");
    route.setAttribute("path", currentPath);
    route.innerHTML = document.body.innerHTML;
    router.appendChild(route);
    document.body.innerHTML = "";
    document.body.appendChild(router);
    routerCreatedManually = true;
  }

  globalThis.addEventListener("popstate", handlePopState);
  document.addEventListener("click", handleLinkClick);

  document.body.addEventListener("mouseover", event => {
    if (event.target.tagName === "A" && event.target.getAttribute("prefetch") === "onHover") {
      handleLinkHover(event);
    }
  });

  const observer = new IntersectionObserver(handleLinkIntersection, {
    root: null,
    threshold: 0.5,
  });
  log("🎭 Created Intersection Observer with config:", {
    root: "viewport",
    threshold: 0.5,
  });

  observeLinks(observer);
};

export { startRouter };

// TODO: create ultra minified version or deploy
// TODO: write proper automated tests
