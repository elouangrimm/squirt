// squirt.js - FINAL VERSION (v2 with latest requests)
(function () {
    if (!window.sq) {
        window.sq = {};
    }

    sq.version = "0.0.5-final"; // Increment version
    sq.host = (function () {
        var devMatch = window.location.search.match(/sq-dev=([^&]+)/);
        if (devMatch && devMatch[1]) {
            var protocol =
                devMatch[1].startsWith("localhost") ||
                devMatch[1].startsWith("127.0.0.1")
                    ? "http://"
                    : "https://";
            return (
                protocol + devMatch[1] + (devMatch[1].endsWith("/") ? "" : "/")
            );
        }
        // !!! IMPORTANT: ADJUST THIS URL TO YOUR ACTUAL HOSTING PATH !!!
        return "https://cdn.jsdelivr.net/gh/elouangrimm/squirt/";
    })();
    sq.closed = true;

    var nextNodeTimeoutId;
    var _globalKeydownListener = null;
    var _globalKeyupListener = null; // For keyup
    var _steppingIntervalId = null;
    var keySteppingSpeed = 120; // Milliseconds between steps when holding arrow key (paused)

    function applyTheme() {
        var sqRoot = document.querySelector(".sq");
        if (!sqRoot) return;
        if (
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches
        ) {
            sqRoot.classList.add("dark-theme-active");
            sqRoot.classList.remove("light-theme-active");
        } else {
            sqRoot.classList.add("light-theme-active");
            sqRoot.classList.remove("dark-theme-active");
        }
    }

    function on(busOrEvts, evtsOrCb, cbOrUndefined) {
        var bus, evts, cb;
        if (cbOrUndefined === undefined) {
            bus = document;
            evts = busOrEvts;
            cb = evtsOrCb;
        } else {
            bus = busOrEvts;
            evts = evtsOrCb;
            cb = cbOrUndefined;
        }
        if (!bus || typeof bus.addEventListener !== "function")
            return function () {};
        evts =
            typeof evts === "string" ? [evts] : Array.isArray(evts) ? evts : [];
        if (typeof cb !== "function") return function () {};
        var removers = evts.map(function (evtName) {
            bus.addEventListener(evtName, cb);
            return function () {
                if (bus && typeof bus.removeEventListener === "function") {
                    bus.removeEventListener(evtName, cb);
                }
            };
        });
        if (removers.length === 1) return removers[0];
        return function () {
            removers.forEach(function (r) {
                r();
            });
        };
    }

    function dispatch(evtName, attrs, dispatcher) {
        var customEvent;
        try {
            customEvent = new CustomEvent(evtName, {
                detail: attrs,
                bubbles: true,
                cancelable: true,
            });
        } catch (e) {
            customEvent = document.createEvent("CustomEvent");
            customEvent.initCustomEvent(evtName, true, true, attrs || null);
        }
        if (attrs) {
            for (var k in attrs) {
                if (attrs.hasOwnProperty(k) && !(k in customEvent)) {
                    try {
                        customEvent[k] = attrs[k];
                    } catch (err) {}
                }
            }
        }
        (dispatcher || document).dispatchEvent(customEvent);
    }

    function makeEl(type, attrs, parent, onLoad, onError) {
        var el = document.createElement(type);
        for (var k in attrs) {
            if (attrs.hasOwnProperty(k)) {
                if (k === "style" && typeof attrs[k] === "object")
                    Object.assign(el.style, attrs[k]);
                else el.setAttribute(k, attrs[k]);
            }
        }
        if (type === "script" || type === "link") {
            if (typeof onLoad === "function") el.onload = onLoad;
            if (typeof onError === "function") el.onerror = onError;
        }
        if (parent) parent.appendChild(el);
        return el;
    }

    function makeDiv(attrs, parent) {
        return makeEl("div", attrs, parent);
    }

    function injectStylesheet(url, onLoad, onError) {
        makeEl(
            "link",
            { rel: "stylesheet", href: url, type: "text/css" },
            document.head,
            onLoad,
            onError
        );
    }

    function map(listLike, f) {
        if (!listLike) return [];
        return Array.prototype.slice.call(listLike).map(f);
    }

    function invoke(objs, funcName, args) {
        args = args || [];
        var objsAreFuncs = false;
        if (objs === null || objs === undefined) return [];
        if (!Array.isArray(objs)) objs = [objs];
        if (typeof funcName === "object" && funcName !== null) {
            args = funcName;
        } else if (typeof funcName === "undefined") {
            objsAreFuncs = true;
        }
        return map(objs, function (o) {
            if (o === null || o === undefined) return undefined;
            try {
                return objsAreFuncs
                    ? typeof o === "function"
                        ? o.apply(null, args)
                        : undefined
                    : o && typeof o[funcName] === "function"
                    ? o[funcName].apply(o, args)
                    : undefined;
            } catch (e) {
                return undefined;
            }
        }).filter(function (item) {
            return item !== undefined;
        });
    }

    function showGUI() {
        var sqRoot = document.querySelector(".sq");
        if (sqRoot) {
            sqRoot.style.display = "block";
            sq.closed = false;
            applyTheme();
        }
        document.body.classList.add("sq-page-blurred");
        if (_globalKeydownListener) _globalKeydownListener();
        if (_globalKeyupListener) _globalKeyupListener(); // Remove old keyup listener
        _globalKeydownListener = on(document, "keydown", handleKeydown);
        _globalKeyupListener = on(document, "keyup", handleKeyup); // Add keyup listener
    }

    function hideGUI() {
        var sqRoot = document.querySelector(".sq");
        if (sqRoot) sqRoot.style.display = "none";
        document.body.classList.remove("sq-page-blurred");
        if (_globalKeydownListener) {
            _globalKeydownListener();
            _globalKeydownListener = null;
        }
        if (_globalKeyupListener) {
            _globalKeyupListener();
            _globalKeyupListener = null;
        } // Remove keyup listener

        sq.closed = true;
        if (nextNodeTimeoutId) clearTimeout(nextNodeTimeoutId);
        if (_steppingIntervalId) {
            clearInterval(_steppingIntervalId);
            _steppingIntervalId = null;
        }
        dispatch("squirt.gui.closed");
    }

    function handleKeydown(e) {
        if (sq.closed) return;

        if (sq.paused) {
            if (e.keyCode === 37 || e.keyCode === 39) {
                e.preventDefault();
                e.stopPropagation();
                if (!_steppingIntervalId) {
                    var direction = e.keyCode === 37 ? -1 : 1;
                    dispatch("squirt.step", { direction: direction });
                    _steppingIntervalId = setInterval(function () {
                        dispatch("squirt.step", { direction: direction });
                    }, keySteppingSpeed);
                }
                return;
            }
        }

        var handler = keyHandlers[e.keyCode];
        if (handler) {
            e.preventDefault();
            e.stopPropagation();
            handler();
        }
    }

    function handleKeyup(e) {
        if (sq.closed) return;
        if (e.keyCode === 37 || e.keyCode === 39) {
            if (_steppingIntervalId) {
                clearInterval(_steppingIntervalId);
                _steppingIntervalId = null;
            }
        }
    }

    var keyHandlers = {
        32: function () {
            dispatch("squirt.play.toggle");
        },
        27: function () {
            dispatch("squirt.close");
        },
        38: function () {
            dispatch("squirt.wpm.adjust", { value: 25 });
        },
        40: function () {
            dispatch("squirt.wpm.adjust", { value: -25 });
        },
        37: function () {
            if (!sq.paused) dispatch("squirt.rewind", { seconds: 5 });
        },
    };

    function makeTextToNodes(wordToNodeFn) {
        return function textToNodes(text) {
            text = "3\n2\n1\n" + text.trim().replace(/\s+\n/g, "\n");
            return text
                .replace(/([,.\!\?\:\;])(?![\"\'\)\]\}])/g, "$1 ")
                .replace(/—/g, " — ")
                .split(/[\s\n]+/g)
                .filter(function (word) {
                    return word.length > 0;
                })
                .map(wordToNodeFn);
        };
    }

    var instructionsRE = /#SQ(.*?)SQ#/;
    function parseSQInstructionsForWord(word, node) {
        var match = word.match(instructionsRE);
        if (match && match.length > 1) {
            node.instructions = [];
            match[1]
                .split("#")
                .filter(function (w) {
                    return w.length > 0;
                })
                .forEach(function (instruction) {
                    var parts = instruction.split("=");
                    if (parts.length === 2) {
                        var val = Number(parts[1]);
                        if (!isNaN(val)) {
                            node.instructions.push(function () {
                                dispatch("squirt.wpm", { value: val });
                            });
                        }
                    }
                });
            return word.replace(instructionsRE, "");
        }
        return word;
    }

    function getORPIndex(word) {
        var length = word.length;
        if (length === 0) return 0;
        var lastChar = word[word.length - 1];
        if (lastChar === "\n") {
            if (length > 1) lastChar = word[word.length - 2];
            else return 0;
            length--;
        }
        if (length === 0) return 0;
        if (",.?!:;\"'".indexOf(lastChar) !== -1 && length > 1) length--;
        return length <= 1
            ? 0
            : length === 2
            ? 1
            : length === 3
            ? 1
            : Math.floor(length / 2) - (length % 2 === 0 ? 1 : 0);
    }

    function wordToNode(word) {
        var node = makeDiv({ class: "word" });
        node.word = parseSQInstructionsForWord(word, node);
        var orpIdx = getORPIndex(node.word);
        node.word.split("").forEach(function charToNode(char, idx) {
            var span = makeEl("span", {}, node);
            span.textContent = char;
            if (idx === orpIdx) span.classList.add("orp");
        });
        node.center = function (orpCharNode) {
            var parentWidth = node.parentNode
                ? node.parentNode.offsetWidth
                : document.querySelector(".sq .word-container")
                ? document.querySelector(".sq .word-container").offsetWidth
                : 300;
            var parentCenter = parentWidth / 2;
            if (orpCharNode && typeof orpCharNode.offsetLeft === "number") {
                var orpCenter =
                    orpCharNode.offsetLeft + orpCharNode.offsetWidth / 2;
                node.style.left = parentCenter - orpCenter + "px";
            } else {
                var wordCenter = node.offsetWidth / 2;
                node.style.left = parentCenter - wordCenter + "px";
            }
        }.bind(null, node.children[orpIdx]);
        return node;
    }

    function readabilityFail(message) {
        var finalWordContainer = document.querySelector(".sq .final-word");
        if (finalWordContainer) {
            finalWordContainer.innerHTML =
                '<div class="error">' +
                (message || "Oops! Squirt could not read this page.") +
                " Try selecting text.</div>";
            finalWordContainer.style.display = "block";
        }
        var readerUi = document.querySelector(".sq .reader");
        if (readerUi) readerUi.style.display = "none";
    }

    (function setupSquirtCore() {
        var nodes,
            nodeIdx = -1,
            lastNode,
            intervalMs,
            currentWpm = 400;
        sq.paused = true;

        var wordContainer = null,
            prerenderer = null,
            finalWordContainer = null,
            readerEl = null;
        var wpmDisplayElement = null;
        var pausePlayLink = null;

        function initDomRefsAndGUI() {
            var existingSquirt = document.querySelector(".sq");
            if (existingSquirt) existingSquirt.remove();

            var squirtRoot = makeDiv({ class: "sq" }, document.body);
            var obscure = makeDiv({ class: "sq-obscure" }, squirtRoot);
            var modal = makeDiv({ class: "modal" }, squirtRoot);
            var controlsEl = makeDiv({ class: "controls" }, modal);
            readerEl = makeDiv({ class: "reader" }, modal);
            wordContainer = makeDiv({ class: "word-container" }, readerEl);
            makeDiv({ class: "focus-indicator-gap" }, wordContainer);
            prerenderer = makeDiv({ class: "word-prerenderer" }, wordContainer);
            finalWordContainer = makeDiv({ class: "final-word" }, modal);
            makeDiv({ class: "keyboard-shortcuts" }, readerEl).innerHTML =
                "⌫ Space, Esc, ↑, ↓, ← मशीन;, →";

            on(obscure, "click", function (e) {
                e.stopPropagation();
                dispatch("squirt.close");
            });

            wpmDisplayElement = makeDiv({ class: "wpm-display" }, controlsEl);

            var pausePlayControl = makeEl(
                "div",
                { class: "sq control pause-play" },
                controlsEl
            );
            pausePlayLink = makeEl("a", { href: "#" }, pausePlayControl);
            on(pausePlayControl, "click", function (e) {
                e.preventDefault();
                dispatch("squirt.play.toggle");
            });

            function updateWpmDisplay(newWpmVal) {
                currentWpm = Math.max(50, Math.min(2000, Number(newWpmVal)));
                intervalMs = (60 * 1000) / currentWpm;
                if (wpmDisplayElement)
                    wpmDisplayElement.textContent = currentWpm + " WPM";
                sq.wpm = currentWpm;
            }
            updateWpmDisplay(currentWpm);

            function updatePlayPauseIcon() {
                if (pausePlayLink)
                    pausePlayLink.innerHTML = sq.paused
                        ? "<i class='fa fa-play'></i> Play"
                        : "<i class='fa fa-pause'></i> Pause";
            }
            updatePlayPauseIcon();

            on("squirt.wpm", function (e) {
                if (e && e.detail && typeof e.detail.value !== "undefined")
                    updateWpmDisplay(e.detail.value);
            });
            on("squirt.wpm.adjust", function (e) {
                if (e && e.detail && typeof e.detail.value === "number")
                    updateWpmDisplay(currentWpm + e.detail.value);
            });
            on("squirt.play.toggle", function () {
                sq.paused ? dispatch("squirt.play") : dispatch("squirt.pause");
            });

            on("squirt.play", function (e) {
                sq.paused = false;
                updatePlayPauseIcon();
                if (_steppingIntervalId) {
                    clearInterval(_steppingIntervalId);
                    _steppingIntervalId = null;
                }
                advanceWordDisplay(e && e.detail && e.detail.jumped);
            });
            on("squirt.pause", function () {
                sq.paused = true;
                updatePlayPauseIcon();
                if (nextNodeTimeoutId) clearTimeout(nextNodeTimeoutId);
            });
            on("squirt.rewind", function (e) {
                if (!nodes || nodes.length === 0 || sq.paused) return;
                if (nextNodeTimeoutId) clearTimeout(nextNodeTimeoutId);
                var secondsToRewind =
                    e.detail && typeof e.detail.seconds === "number"
                        ? e.detail.seconds
                        : 5;
                var wordsToRewind = Math.floor(
                    (secondsToRewind * 1000) / (intervalMs || 60000 / 400)
                );
                nodeIdx = Math.max(-1, nodeIdx - wordsToRewind);
                var rewindCount = 0;
                while (
                    nodeIdx > 0 &&
                    nodes[nodeIdx + 1] &&
                    !nodes[nodeIdx + 1].word.match(/\.|\?|!|\n/) &&
                    rewindCount < 50
                ) {
                    nodeIdx--;
                    rewindCount++;
                }
                advanceWordDisplay(true);
            });
            on("squirt.step", function (e) {
                if (
                    !sq.paused ||
                    !nodes ||
                    nodes.length === 0 ||
                    !e.detail ||
                    typeof e.detail.direction !== "number"
                )
                    return;
                var newIndex = nodeIdx + e.detail.direction;

                if (newIndex < 0) {
                    // Stepped back before first word
                    nodeIdx = -1; // Keep it at -1, effectively "before start"
                    if (lastNode && lastNode.parentNode) lastNode.remove();
                    lastNode = null;
                    // Optionally clear word container text or show placeholder
                    if (wordContainer)
                        wordContainer.innerHTML =
                            '<div class="focus-indicator-gap"></div>'; // Reset word container
                } else if (newIndex >= nodes.length) {
                    // Stepped past last word
                    nodeIdx = nodes.length - 1; // Keep at last valid index for display
                    if (finalWordContainer) {
                        finalWordContainer.innerHTML = "<div>All done!</div>";
                        finalWordContainer.style.display = "block";
                    }
                    if (readerEl) readerEl.style.display = "none";
                    if (_steppingIntervalId) {
                        clearInterval(_steppingIntervalId);
                        _steppingIntervalId = null;
                    }
                } else {
                    nodeIdx = newIndex;
                    displayWordAtIndex(nodeIdx);
                }
            });

            on(document, "squirt.close", function () {
                if (!sq.closed) hideGUI();
            });
            showGUI();
        }

        function loadTextAndStart() {
            var textContent;
            if (window.squirtText) {
                textContent = window.squirtText;
            } else {
                var selection = window.getSelection();
                if (
                    selection &&
                    selection.type == "Range" &&
                    selection.rangeCount > 0
                ) {
                    var container = document.createElement("div");
                    for (var i = 0, len = selection.rangeCount; i < len; ++i) {
                        container.appendChild(
                            selection.getRangeAt(i).cloneContents()
                        );
                    }
                    textContent = container.textContent;
                } else {
                    if (
                        window.readability &&
                        typeof window.readability.grabArticleText === "function"
                    ) {
                        try {
                            textContent = window.readability.grabArticleText();
                        } catch (err) {
                            readabilityFail("Readability processing failed.");
                            return;
                        }
                    } else {
                        makeEl(
                            "script",
                            { src: sq.host + "readability.js" },
                            document.head,
                            function readabilityLoaded() {
                                if (
                                    window.readability &&
                                    typeof window.readability
                                        .grabArticleText === "function"
                                ) {
                                    try {
                                        textContent =
                                            window.readability.grabArticleText();
                                        if (
                                            textContent &&
                                            textContent.trim() !== ""
                                        )
                                            processAndRead(textContent);
                                        else
                                            readabilityFail(
                                                "Readability found no content."
                                            );
                                    } catch (err) {
                                        readabilityFail(
                                            "Readability execution error after load."
                                        );
                                    }
                                } else {
                                    readabilityFail(
                                        "Readability script loaded but not functional."
                                    );
                                }
                            },
                            function readabilityError() {
                                readabilityFail(
                                    "Failed to load Readability.js script."
                                );
                            }
                        );
                        return;
                    }
                }
            }
            processAndRead(textContent);
        }

        function processAndRead(text) {
            if (!text || typeof text !== "string" || text.trim() === "") {
                readabilityFail("No text content found or provided to read.");
                return;
            }
            nodes = makeTextToNodes(wordToNode)(text);
            if (!nodes || nodes.length === 0) {
                readabilityFail("Could not process text into readable words.");
                return;
            }
            nodeIdx = -1;
            dispatch("squirt.play", { jumped: true }); // Use object for detail
        }

        function displayWordAtIndex(idx) {
            if (lastNode && lastNode.parentNode) lastNode.remove();
            if (!nodes || idx < 0 || idx >= nodes.length) {
                // If index is out of bounds (e.g. after stepping beyond start/end while paused)
                // ensure wordContainer is cleared or reset.
                if (wordContainer && (!nodes || idx < 0)) {
                    wordContainer.innerHTML =
                        '<div class="focus-indicator-gap"></div>'; // Reset
                }
                return;
            }

            lastNode = nodes[idx];
            if (!wordContainer || !lastNode) return;
            // Ensure wordContainer is clean except for focus-indicator-gap before appending
            while (
                wordContainer.firstChild &&
                wordContainer.firstChild.className !== "focus-indicator-gap" &&
                wordContainer.firstChild.className !== "word-prerenderer"
            ) {
                wordContainer.removeChild(wordContainer.firstChild);
            }
            // Find prerenderer and insert before it, or append if not found (should exist)
            var prerendererRef =
                wordContainer.querySelector(".word-prerenderer");
            if (prerendererRef) {
                wordContainer.insertBefore(lastNode, prerendererRef);
            } else {
                wordContainer.appendChild(lastNode);
            }

            if (typeof lastNode.center === "function") lastNode.center();
            if (lastNode.instructions) invoke(lastNode.instructions);
            prerenderNextWord(); // Renamed
        }

        function prerenderNextWord() {
            if (
                !prerenderer ||
                !nodes ||
                nodeIdx + 1 < 0 ||
                nodeIdx + 1 >= nodes.length
            ) {
                if (prerenderer)
                    while (prerenderer.firstChild) {
                        prerenderer.removeChild(prerenderer.firstChild);
                    } // Clear if no next word
                return;
            }
            var wordNodeToPrerender = nodes[nodeIdx + 1];
            if (!wordNodeToPrerender) {
                if (prerenderer)
                    while (prerenderer.firstChild) {
                        prerenderer.removeChild(prerenderer.firstChild);
                    }
                return;
            }
            while (prerenderer.firstChild) {
                prerenderer.removeChild(prerenderer.firstChild);
            }
            var clonedNode = wordNodeToPrerender.cloneNode(true);
            prerenderer.appendChild(clonedNode);
            if (typeof clonedNode.center === "function") {
                clonedNode.center = function (orpCharNode) {
                    var parentWidth = clonedNode.parentNode
                        ? clonedNode.parentNode.offsetWidth
                        : document.querySelector(".sq .word-container")
                        ? document.querySelector(".sq .word-container")
                              .offsetWidth
                        : 300;
                    var parentCenter = parentWidth / 2;
                    if (
                        orpCharNode &&
                        typeof orpCharNode.offsetLeft === "number"
                    ) {
                        var orpCenter =
                            orpCharNode.offsetLeft +
                            orpCharNode.offsetWidth / 2;
                        clonedNode.style.left = parentCenter - orpCenter + "px";
                    } else {
                        var wordCenter = clonedNode.offsetWidth / 2;
                        clonedNode.style.left =
                            parentCenter - wordCenter + "px";
                    }
                }.bind(null, clonedNode.children[getORPIndex(clonedNode.word)]);
                clonedNode.center();
            }
        }

        function advanceWordDisplay(jumped) {
            if (sq.paused) return;

            nodeIdx++;
            if (!nodes || nodeIdx >= nodes.length) {
                if (finalWordContainer) {
                    finalWordContainer.innerHTML = "<div>All done!</div>";
                    finalWordContainer.style.display = "block";
                }
                if (readerEl) readerEl.style.display = "none";
                dispatch("squirt.pause");
                return;
            }

            displayWordAtIndex(nodeIdx);

            var delayMultiplier = 1;
            if (jumped) delayMultiplier = 2.5;
            else {
                var wordStr = lastNode.word;
                var lastChar = wordStr[wordStr.length - 1];
                if (lastChar === "\n") delayMultiplier = 2.5;
                else if (".!?".indexOf(lastChar) !== -1) delayMultiplier = 2.0;
                else if (",;:–".indexOf(lastChar) !== -1) delayMultiplier = 1.5;
                else if (wordStr.length < 4) delayMultiplier = 1.2;
                else if (wordStr.length > 11) delayMultiplier = 1.3;
            }
            nextNodeTimeoutId = setTimeout(function () {
                advanceWordDisplay(false);
            }, intervalMs * delayMultiplier);
        }

        injectStylesheet(
            "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css",
            null,
            function () {
                /* console.warn("Could not load Font Awesome."); */
            }
        );
        injectStylesheet(
            sq.host + "squirt.css",
            function stylesLoaded() {
                initDomRefsAndGUI();
                loadTextAndStart();
            },
            function stylesError() {
                alert(
                    "Squirt: Failed to load main stylesheet. UI may be broken."
                );
                initDomRefsAndGUI();
                loadTextAndStart();
            }
        );
        on(document, "squirt.again", function () {
            if (sq.closed) {
                var gui = document.querySelector(".sq");
                if (!gui) {
                    initDomRefsAndGUI();
                    loadTextAndStart();
                } else {
                    showGUI();
                    nodeIdx = -1;
                    if (finalWordContainer)
                        finalWordContainer.style.display = "none";
                    if (readerEl) readerEl.style.display = "block";
                    loadTextAndStart();
                }
            } else {
                // If already open, ensure it's visible and perhaps reset text or unpause
                showGUI(); // Ensure it's visible if somehow hidden without state change
                if (sq.paused) dispatch("squirt.play"); // If it was paused, play
                // else, if already playing, maybe restart text or do nothing
            }
        });
        if (window.matchMedia) {
            window
                .matchMedia("(prefers-color-scheme: dark)")
                .addEventListener("change", applyTheme);
        }
    })();
})();
