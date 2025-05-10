// squirt.js - MODIFIED
if (!window.sq) {
    window.sq = {};
}

sq.version = "0.0.2-mod"; // Updated version
sq.host = window.location.search.match(/sq-dev=([^&]+)/)
    ? "http://" + window.location.search.match(/sq-dev=([^&]+)/)[1] + "/" // For local dev e.g. sq-dev=localhost:4000
    : "https://elouangrimm.github.io/squirt/"; // DEFAULT HOST - ADJUST IF YOUR GITHUB PAGES URL IS DIFFERENT

(function () {
    // Removed Keen parameter

    // Keen.addEvent('load'); // REMOVED

    on("mousemove", function () {
        var modal = document.querySelector(".sq .modal");
        if (modal) modal.style.cursor = "auto";
    });

    (function makeSquirt(read, makeGUI) {
        on("squirt.again", startSquirt);
        // Try to load Font Awesome from a CDN as a fallback or primary
        injectStylesheet(
            "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css"
        );
        injectStylesheet(sq.host + "squirt.css", function stylesLoaded() {
            makeGUI();
            startSquirt();
        });

        function startSquirt() {
            // Keen.addEvent('start'); // REMOVED
            showGUI();
            getText(read);
        }

        function getText(read) {
            if (window.squirtText) return read(window.squirtText);

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
                return read(container.textContent);
            }

            var handler;
            function readabilityReady() {
                if (handler && document.removeEventListener)
                    document.removeEventListener("readability.ready", handler); // Corrected event name
                if (
                    window.readability &&
                    typeof window.readability.grabArticleText === "function"
                ) {
                    read(window.readability.grabArticleText());
                } else {
                    readabilityFail("Readability failed to execute.");
                }
            }

            if (
                window.readability &&
                typeof window.readability.grabArticleText === "function"
            )
                return readabilityReady();

            makeEl(
                "script",
                {
                    src: sq.host + "readability.js", // Ensure readability.js is at this path
                },
                document.head,
                readabilityReady,
                function () {
                    readabilityFail("Failed to load Readability.js");
                }
            ); // Added load and error handlers
            handler = on(document, "readability.ready", readabilityReady); // Listen on document
        }
    })(makeRead(makeTextToNodes(wordToNode)), makeGUI);

    function makeRead(textToNodes) {
        sq.paused = false;
        var nodeIdx, nodes, lastNode, nextNodeTimeoutId;

        function incrememntNodeIdx(increment) {
            var ret = nodeIdx;
            nodeIdx += increment || 1;
            nodeIdx = Math.max(0, nodeIdx);
            if (nodes && nodes.length > 0) {
                // Check if nodes exist
                prerender();
            }
            return ret;
        }

        var intervalMs, _wpm;
        function wpm(_newWpm) {
            // Renamed parameter
            _wpm = Math.max(50, Math.min(2000, Number(_newWpm))); // Add bounds for WPM
            intervalMs = (60 * 1000) / _wpm;
        }

        (function readerEventHandlers() {
            on("squirt.close", function () {
                sq.closed = true;
                clearTimeout(nextNodeTimeoutId);
                // Keen.addEvent('close'); // REMOVED
            });

            on("squirt.wpm.adjust", function (e) {
                if (e && typeof e.value === "number") {
                    dispatch("squirt.wpm", { value: e.value + _wpm });
                }
            });

            on("squirt.wpm", function (e) {
                if (e && typeof e.value !== "undefined") {
                    sq.wpm = Number(e.value);
                    wpm(sq.wpm); // Use sq.wpm
                    dispatch("squirt.wpm.after");
                    // if(e.notForKeen == undefined) Keen.addEvent('wpm', {'wpm': sq.wpm}); // REMOVED
                }
            });

            on("squirt.pause", pause);
            on("squirt.play", play);

            on("squirt.play.toggle", function () {
                dispatch(sq.paused ? "squirt.play" : "squirt.pause");
            });

            on("squirt.rewind", function (e) {
                if (!nodes || nodes.length === 0) return; // Guard against no nodes
                var secondsToRewind =
                    e && typeof e.seconds === "number" ? e.seconds : 10;
                var wordsToRewind = Math.floor(
                    (secondsToRewind * 1000) / (intervalMs || 60000 / 400)
                ); // Default interval if not set

                if (!sq.paused) clearTimeout(nextNodeTimeoutId);
                incrememntNodeIdx(-wordsToRewind);
                // Rewind to the beginning of a sentence if possible
                var rewindCount = 0; // Safety break
                while (
                    nodeIdx > 0 &&
                    nodes[nodeIdx] &&
                    !nodes[nodeIdx].word.match(/\.|\?|!|\n/) &&
                    rewindCount < 50
                ) {
                    incrememntNodeIdx(-1);
                    rewindCount++;
                }
                if (nodeIdx < 0) nodeIdx = 0; // Ensure not negative

                nextNode(true); // Pass jumped=true
                // Keen.addEvent('rewind'); // REMOVED
            });
        })();

        function pause() {
            sq.paused = true;
            dispatch("squirt.pause.after");
            clearTimeout(nextNodeTimeoutId);
            // Keen.addEvent('pause'); // REMOVED
        }

        function play(e) {
            sq.paused = false;
            dispatch("squirt.play.after"); // Changed from pause.after
            var wpmSelector = document.querySelector(".sq .wpm-selector");
            if (wpmSelector) wpmSelector.style.display = "none";
            nextNode(e && e.jumped);
            // if(e && e.notForKeen === undefined) Keen.addEvent('play'); // REMOVED
        }

        var toRender;
        function prerender() {
            if (!nodes || nodeIdx < 0 || nodeIdx >= nodes.length) return; // Bounds check
            toRender = nodes[nodeIdx];
            if (toRender == null || !prerenderer) return; // Guard against null prerenderer
            // Clear prerenderer before appending
            while (prerenderer.firstChild) {
                prerenderer.removeChild(prerenderer.firstChild);
            }
            prerenderer.appendChild(toRender);
            if (typeof toRender.center === "function") toRender.center();
        }

        function finalWord() {
            // Keen.addEvent('final-word'); // REMOVED
            var readerEl = document.querySelector(".sq .reader");
            if (readerEl) toggle(readerEl);

            // Simplified final word message
            if (finalWordContainer) {
                finalWordContainer.innerHTML = "<div>Finished!</div>";
                toggle(finalWordContainer);
            }
            return;
        }

        var nextIdx; // Removed delay, jumped as they are local to nextNode
        function nextNode(jumped) {
            // jumped is a boolean
            if (lastNode && lastNode.parentNode) lastNode.remove();

            nextIdx = incrememntNodeIdx();
            if (!nodes || nextIdx >= nodes.length) return finalWord();

            lastNode = nodes[nextIdx];
            if (!wordContainer || !lastNode) return; // Guard
            wordContainer.appendChild(lastNode);

            if (lastNode.instructions) invoke(lastNode.instructions);
            if (sq.paused) return;

            var currentDelay =
                (intervalMs || 60000 / 400) *
                getDelay(lastNode, jumped || false);
            nextNodeTimeoutId = setTimeout(nextNode, currentDelay);
        }

        var waitAfterShortWord = 1.2;
        var waitAfterComma = 2;
        var waitAfterPeriod = 3;
        var waitAfterParagraph = 3.5;
        var waitAfterLongWord = 1.5;
        function getDelay(node, jumped) {
            if (!node || !node.word) return 1;
            var word = node.word;
            if (jumped) return waitAfterPeriod;
            if (word === "Mr." || word === "Mrs." || word === "Ms.") return 1;

            var lastChar = word[word.length - 1];
            if (lastChar === "”" || lastChar === '"')
                lastChar = word[word.length - 2]; // Check second to last for quotes

            if (lastChar === "\n") return waitAfterParagraph;
            if (".!?".indexOf(lastChar) !== -1) return waitAfterPeriod;
            if (",;:–".indexOf(lastChar) !== -1) return waitAfterComma; // Added en-dash
            if (word.length < 4) return waitAfterShortWord;
            if (word.length > 11) return waitAfterLongWord;
            return 1;
        }

        // function showTweetButton(words, minutes){...} // REMOVED - or simplify if desired
        // function showInstallLink(){...} // REMOVED

        function readabilityFail(message) {
            // Keen.addEvent('readability-fail'); // REMOVED
            var modal = document.querySelector(".sq .modal");
            if (modal) {
                modal.innerHTML =
                    '<div class="error">' +
                    (message || "Oops! Squirt could not read this page.") +
                    " Try selecting text.</div>";
            }
            // Optionally hide the reader UI elements if Readability fails
            var readerUi = document.querySelector(".sq .reader");
            if (readerUi) readerUi.style.display = "none";
            var controlsUi = document.querySelector(".sq .controls");
            if (controlsUi) controlsUi.style.display = "none";
        }

        dispatch("squirt.wpm", { value: 400 /*, notForKeen: true*/ }); // REMOVED notForKeen

        var wordContainer, prerenderer, finalWordContainer;
        function initDomRefs() {
            wordContainer = document.querySelector(".sq .word-container");
            if (wordContainer) {
                invoke(wordContainer.querySelectorAll(".sq .word"), "remove");
            }
            prerenderer = document.querySelector(".sq .word-prerenderer");
            finalWordContainer = document.querySelector(".sq .final-word");

            var readerEl = document.querySelector(".sq .reader");
            if (readerEl) readerEl.style.display = "block";

            var finalWordEl = document.querySelector(".sq .final-word");
            if (finalWordEl) finalWordEl.style.display = "none";
        }

        return function read(text) {
            initDomRefs();
            if (!text || typeof text !== "string" || text.trim() === "") {
                return readabilityFail("No text found to read.");
            }

            nodes = textToNodes(text);
            if (!nodes || nodes.length === 0) {
                return readabilityFail("Could not process text into words.");
            }
            nodeIdx = -1; // Start at -1 so first increment makes it 0

            prerender(); // Prerender the first word
            dispatch("squirt.play", { jumped: true }); // Start playing, jumped=true for initial delay
        };
    }

    function makeTextToNodes(wordToNode) {
        return function textToNodes(text) {
            // Prepend "3 2 1" with newlines for countdown effect
            text = "3\n2\n1\n" + text.trim().replace(/\s+\n/g, "\n");
            return text
                .replace(/([,\.\!\?\:\;])(?![\"\'\)\]\}])/g, "$1 ") // Add space after punctuation unless followed by quote/paren etc.
                .replace(/—/g, " — ") // Add spaces around em-dashes
                .split(/[\s\n]+/g) // Split by any whitespace including newlines
                .filter(function (word) {
                    return word.length > 0;
                })
                .map(wordToNode);
        };
    }

    var instructionsRE = /#SQ(.*?)SQ#/; // Made quantifier non-greedy
    function parseSQInstructionsForWord(word, node) {
        var match = word.match(instructionsRE);
        if (match && match.length > 1) {
            node.instructions = [];
            match[1]
                .split("#")
                .filter(function (w) {
                    return w.length > 0;
                }) // Use length > 0
                .forEach(function (instruction) {
                    // Use forEach
                    var parts = instruction.split("=");
                    if (parts.length === 2) {
                        var val = Number(parts[1]);
                        if (!isNaN(val)) {
                            node.instructions.push(function () {
                                dispatch("squirt.wpm", {
                                    value: val /*, notForKeen: true*/,
                                }); // REMOVED notForKeen
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
            // Handle newline correctly
            if (length > 1) lastChar = word[word.length - 2];
            else return 0; // Single newline character
            length--;
        }
        if (length === 0) return 0;

        // Reduce length if ends with punctuation, but not if it's the only char
        if (",.?!:;\"'".indexOf(lastChar) !== -1 && length > 1) length--;

        return length <= 1
            ? 0
            : length === 2
            ? 1
            : length === 3
            ? 1
            : Math.floor(length / 2) - (length % 2 === 0 ? 1 : 0); // Adjusted for better centering
    }

    function wordToNode(word) {
        var node = makeDiv({ class: "word" });
        node.word = parseSQInstructionsForWord(word, node);

        var orpIdx = getORPIndex(node.word);

        node.word.split("").forEach(function charToNode(char, idx) {
            // Use forEach
            var span = makeEl("span", {}, node);
            span.textContent = char;
            if (idx === orpIdx) span.classList.add("orp");
        });

        node.center = function (orpNodeResolved) {
            // Renamed orpNode to avoid conflict
            if (orpNodeResolved && orpNodeResolved.offsetLeft !== undefined) {
                // Check if orpNodeResolved is a valid element
                var val =
                    orpNodeResolved.offsetLeft +
                    orpNodeResolved.offsetWidth / 2;
                node.style.left = "-" + val + "px";
            } else {
                // Fallback if ORP char/node isn't found, center based on overall width
                node.style.left = "-" + node.offsetWidth / 2 + "px";
            }
        }.bind(null, node.children[orpIdx]);

        return node;
    }

    var disableKeyboardShortcuts;
    function showGUI() {
        blurPage(); // Renamed for clarity
        var sqRoot = document.querySelector(".sq");
        if (sqRoot) sqRoot.style.display = "block";
        disableKeyboardShortcuts = on(document, "keydown", handleKeypress); // Listen on document
    }

    function hideGUI() {
        unblurPage(); // Renamed for clarity
        var sqRoot = document.querySelector(".sq");
        if (sqRoot) sqRoot.style.display = "none";
        if (typeof disableKeyboardShortcuts === "function")
            disableKeyboardShortcuts();
        disableKeyboardShortcuts = null; // Clear reference
    }

    var keyHandlers = {
        32: function () {
            dispatch("squirt.play.toggle");
        }, // Space
        27: function () {
            dispatch("squirt.close");
        }, // Escape
        38: function () {
            dispatch("squirt.wpm.adjust", { value: 25 });
        }, // Up arrow, increment WPM
        40: function () {
            dispatch("squirt.wpm.adjust", { value: -25 });
        }, // Down arrow, decrement WPM
        37: function () {
            dispatch("squirt.rewind", { seconds: 5 });
        }, // Left arrow, rewind
        // Right arrow could be fast-forward if implemented
    };

    function handleKeypress(e) {
        var handler = keyHandlers[e.keyCode];
        if (handler) {
            handler();
            e.preventDefault(); // Prevent default browser action for these keys
        }
        // return false; // Not strictly necessary if preventDefault is called
    }

    function blurPage() {
        // Renamed
        map(document.body.children, function (node) {
            if (
                node &&
                !node.classList.contains("sq") &&
                node.tagName !== "SCRIPT" &&
                node.tagName !== "LINK"
            ) {
                node.classList.add("sq-blur");
            }
        });
    }

    function unblurPage() {
        // Renamed
        map(document.body.children, function (node) {
            if (node) node.classList.remove("sq-blur");
        });
    }

    function makeGUI() {
        var existingSquirt = document.querySelector(".sq");
        if (existingSquirt) existingSquirt.remove(); // Remove old GUI if any

        var squirtRoot = makeDiv({ class: "sq" }, document.body); // Renamed variable
        squirtRoot.style.display = "none";
        on(squirtRoot, "squirt.close", hideGUI); // Listen on squirtRoot for close event if dispatched there
        var obscure = makeDiv({ class: "sq-obscure" }, squirtRoot);
        on(obscure, "click", function () {
            dispatch("squirt.close");
        });

        // on(window, 'orientationchange', function(){ // REMOVED Keen event
        // Keen.addEvent('orientation-change', {'orientation': window.orientation});
        // });

        var modal = makeDiv({ class: "modal" }, squirtRoot);
        var controls = makeDiv({ class: "controls" }, modal);
        var reader = makeDiv({ class: "reader" }, modal);
        var wordContainer = makeDiv({ class: "word-container" }, reader);
        makeDiv({ class: "focus-indicator-gap" }, wordContainer); // This is the red line
        makeDiv({ class: "word-prerenderer" }, wordContainer); // For pre-rendering, hidden
        makeDiv({ class: "final-word" }, modal); // For "finished" message
        var keyboard = makeDiv({ class: "keyboard-shortcuts" }, reader);
        keyboard.innerHTML = "⌫ Space, Esc, ↑, ↓, ←"; // Improved display

        (function makeWPMControls(parentControls) {
            // Renamed make to makeWPMControls

            (function makeWPMSelect() {
                var control = makeDiv(
                    { class: "sq wpm sq control" },
                    parentControls
                );
                var wpmLink = makeEl("a", {}, control);
                bind("{{wpm}} WPM", sq, wpmLink); // sq needs a wpm property
                if (!sq.wpm) sq.wpm = 400; // Initialize if not set
                on("squirt.wpm.after", function () {
                    if (wpmLink.render) wpmLink.render();
                });

                var wpmSelector = makeDiv(
                    { class: "sq wpm-selector" },
                    parentControls
                );
                wpmSelector.style.display = "none";

                on(control, "click", function () {
                    var shouldShowSelector = toggle(wpmSelector);
                    dispatch(
                        shouldShowSelector ? "squirt.pause" : "squirt.play"
                    );
                });

                var wpmOptions = [200, 300, 400, 500, 600, 700, 800, 900];
                wpmOptions.forEach(function (baseWpm) {
                    var opt = makeDiv({ class: "sq wpm-option" }, wpmSelector);
                    var a = makeEl("a", {}, opt);
                    a.textContent = baseWpm + " WPM"; // Simpler display
                    on(opt, "click", function (e) {
                        dispatch("squirt.wpm", { value: baseWpm });
                        dispatch("squirt.play");
                        wpmSelector.style.display = "none";
                    });
                });
            })();

            (function makeRewind() {
                var container = makeEl(
                    "div",
                    { class: "sq rewind sq control" },
                    parentControls
                );
                var a = makeEl("a", { href: "#" }, container);
                on(container, "click", function (e) {
                    dispatch("squirt.rewind", { seconds: 5 }); // Rewind 5 seconds
                    e.preventDefault();
                });
                a.innerHTML = "<i class='fa fa-backward'></i> 5s";
            })();

            (function makePausePlay() {
                // Renamed
                var container = makeEl(
                    "div",
                    { class: "sq pause-play control" },
                    parentControls
                ); // Combined class
                var a = makeEl("a", { href: "#" }, container);
                var pauseIcon = "<i class='fa fa-pause'></i>";
                var playIcon = "<i class='fa fa-play'></i>";
                function updateIcon() {
                    a.innerHTML = sq.paused ? playIcon : pauseIcon;
                }
                on("squirt.play.after", updateIcon); // Listen to specific events
                on("squirt.pause.after", updateIcon);
                on(container, "click", function (clickEvt) {
                    dispatch("squirt.play.toggle");
                    clickEvt.preventDefault();
                });
                updateIcon(); // Initial state
            })();
        })(controls);
        dispatch("squirt.els.render"); // Initial render for WPM display
    }

    function map(listLike, f) {
        if (!listLike) return [];
        listLike = Array.prototype.slice.call(listLike);
        return Array.prototype.map.call(listLike, f);
    }

    function invoke(objs, funcName, args) {
        args = args || [];
        var objsAreFuncs = false;
        if (objs === null || objs === undefined) return []; // Handle null/undefined objs
        if (!Array.isArray(objs)) objs = [objs]; // Ensure objs is an array

        switch (typeof funcName) {
            case "object":
                if (funcName !== null) args = funcName;
                objsAreFuncs = false;
                break;
            case "undefined":
                objsAreFuncs = true;
                break;
        }
        return map(objs, function (o) {
            if (o === null || o === undefined) return;
            try {
                return objsAreFuncs
                    ? typeof o === "function"
                        ? o.apply(null, args)
                        : undefined
                    : o && typeof o[funcName] === "function"
                    ? o[funcName].apply(o, args)
                    : undefined;
            } catch (e) {
                /* console.error("Error invoking function:", e); */ return undefined;
            }
        }).filter(function (item) {
            return item !== undefined;
        });
    }

    function makeEl(type, attrs, parent, onLoad, onError) {
        var el = document.createElement(type);
        for (var k in attrs) {
            if (attrs.hasOwnProperty(k)) {
                if (k === "style" && typeof attrs[k] === "object") {
                    Object.assign(el.style, attrs[k]);
                } else {
                    el.setAttribute(k, attrs[k]);
                }
            }
        }
        if (type === "script" || type === "link") {
            if (typeof onLoad === "function") el.onload = onLoad;
            if (typeof onError === "function") el.onerror = onError;
        }
        if (parent) parent.appendChild(el);
        return el;
    }

    function bind(expr, data, el) {
        if (!el) return; // Guard against null element
        el.render = render.bind(null, expr, data, el);
        // Consider more specific event for rendering if 'squirt.els.render' is too broad
        var removeRenderListener = on(
            document,
            "squirt.els.render",
            function () {
                if (el && el.render) el.render();
            }
        );
        // Optional: return a function to remove this specific listener if el is removed
        return removeRenderListener;
    }

    function render(expr, data, el) {
        if (!el || !data) return; // Guard
        var rendered = expr;
        // More robust template replacement
        rendered = expr.replace(
            /\{\{\s*([^}\s]+)\s*\}\}/g,
            function (match, key) {
                return data.hasOwnProperty(key) ? data[key] : "";
            }
        );
        el.textContent = rendered;
    }

    function makeDiv(attrs, parent) {
        return makeEl("div", attrs, parent);
    }

    function injectStylesheet(url, onLoad, onError) {
        var el = makeEl(
            "link",
            {
                rel: "stylesheet",
                href: url,
                type: "text/css",
            },
            document.head,
            onLoad,
            onError
        ); // Pass onLoad and onError
    }

    function on(busOrEvts, evtsOrCb, cbOrUndefined) {
        var bus, evts, cb;
        if (cbOrUndefined === undefined) {
            // (evts, cb) signature, bus is document
            bus = document;
            evts = busOrEvts;
            cb = evtsOrCb;
        } else {
            // (bus, evts, cb) signature
            bus = busOrEvts;
            evts = evtsOrCb;
            cb = cbOrUndefined;
        }

        if (!bus || typeof bus.addEventListener !== "function") {
            // console.error("Invalid event bus:", bus);
            return function () {}; // Return no-op remover
        }

        evts =
            typeof evts === "string" ? [evts] : Array.isArray(evts) ? evts : []; // Ensure evts is an array

        var removers = evts.map(function (evtName) {
            if (typeof cb !== "function") return function () {}; // If cb is not a function, do nothing
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
        }; // Combined remover
    }

    function dispatch(evtName, attrs, dispatcher) {
        // Renamed evt to evtName
        var customEvent;
        try {
            customEvent = new CustomEvent(evtName, {
                detail: attrs,
                bubbles: true,
                cancelable: true,
            });
        } catch (e) {
            customEvent = document.createEvent("CustomEvent");
            customEvent.initCustomEvent(evtName, true, true, attrs || null); // Pass null if attrs undefined
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

    function toggle(el) {
        if (!el || !el.style) return false; // Guard
        var s = window.getComputedStyle(el);
        var isHidden = s.display === "none" || el.style.display === "none";
        el.style.display = isHidden ? "block" : "none";
        return !isHidden; // Return true if now visible
    }
})(); // Immediately invoked with no Keen parameter
