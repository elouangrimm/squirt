javascript: (function () {
    if (
        window.sq &&
        window.sq.closed === false &&
        typeof window.sq.version !== "undefined"
    ) {
        window.document.dispatchEvent(
            new CustomEvent("squirt.again")
        ); /* Use CustomEvent for better compatibility */
    } else {
        window.sq = window.sq || {};
        var scriptId = "squirtBookmarkletScript";
        var existingScript = document.getElementById(scriptId);
        if (existingScript) existingScript.remove();

        var scriptSrc =
            "https://elouangrimm.github.io/squirt/squirt.js"; /* ADJUST THIS IF YOUR URL IS DIFFERENT */
        var devHostMatch = window.location.search.match(/sq-dev=([^&]+)/);

        if (devHostMatch && devHostMatch[1]) {
            var devHost = devHostMatch[1];
            var protocol =
                devHost.startsWith("localhost") ||
                devHost.startsWith("127.0.0.1")
                    ? "http://"
                    : "https://";
            scriptSrc =
                protocol +
                devHost +
                (devHost.endsWith("/") ? "" : "/") +
                "squirt.js";
        }

        var s = document.createElement("script");
        s.id = scriptId;
        s.src = scriptSrc;
        s.onerror = function () {
            alert(
                "Error loading Squirt script from: " +
                    scriptSrc +
                    "\nPlease check the console for details and ensure the URL is correct and the file is accessible."
            );
        };
        document.body.appendChild(s);
    }
})();
