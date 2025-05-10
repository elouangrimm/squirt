javascript: (function () {
    if (
        window.sq &&
        window.sq.closed === false &&
        typeof window.sq.version !== "undefined"
    ) {
        window.document.dispatchEvent(new Event("squirt.again"));
    } else {
        window.sq = window.sq || {};

        var scriptSrc = "https://elouangrimm.github.io/squirt/squirt.js";
        var devHostMatch = window.location.search.match(/sq-dev=([^&]+)/);

        if (devHostMatch) {
            var devHost = devHostMatch[1];
            scriptSrc = "http://" + devHost + "/squirt.js";
        }

        var oldScript = document.getElementById("squirtBookmarkletScript");
        if (oldScript) {
            oldScript.remove();
        }

        var s = document.createElement("script");
        s.id = "squirtBookmarkletScript";
        s.src = scriptSrc;
        s.onerror = function () {
            alert(
                "Error loading Squirt script. Please check the console for details and ensure the script URL is correct: " +
                    scriptSrc
            );
        };
        document.body.appendChild(s);
    }
})();
