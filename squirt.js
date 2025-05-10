// squirt.js - FINAL VERSION
(function() {
    if (!window.sq) { window.sq = {}; }

    sq.version = '0.0.3-final';
    sq.host = (function() {
        var devMatch = window.location.search.match(/sq-dev=([^&]+)/);
        if (devMatch && devMatch[1]) {
            var protocol = devMatch[1].startsWith('localhost') || devMatch[1].startsWith('127.0.0.1') ? 'http://' : 'https://';
            return protocol + devMatch[1] + (devMatch[1].endsWith('/') ? '' : '/');
        }
        return 'https://elouangrimm.github.io/squirt/'; // ADJUST THIS IF YOUR URL IS DIFFERENT
    })();
    sq.closed = true; // Start in a closed state

    var nextNodeTimeoutId; // Keep this in a scope accessible by cleanup functions

    function applyTheme() {
        var sqRoot = document.querySelector('.sq');
        if (!sqRoot) return;

        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            sqRoot.classList.add('dark-theme-active');
            sqRoot.classList.remove('light-theme-active');
        } else {
            sqRoot.classList.add('light-theme-active');
            sqRoot.classList.remove('dark-theme-active');
        }
    }

    function on(busOrEvts, evtsOrCb, cbOrUndefined){
        var bus, evts, cb;
        if(cbOrUndefined === undefined){
            bus = document; evts = busOrEvts; cb = evtsOrCb;
        } else {
            bus = busOrEvts; evts = evtsOrCb; cb = cbOrUndefined;
        }
        if (!bus || typeof bus.addEventListener !== 'function') return function() {};
        evts = typeof evts === 'string' ? [evts] : (Array.isArray(evts) ? evts : []);
        if (typeof cb !== 'function') return function() {};

        var removers = evts.map(function(evtName){
            bus.addEventListener(evtName, cb);
            return function(){
                if (bus && typeof bus.removeEventListener === 'function') {
                    bus.removeEventListener(evtName, cb);
                }
            };
        });
        if(removers.length === 1) return removers[0];
        return function() { removers.forEach(function(r) { r(); }); };
    }

    function dispatch(evtName, attrs, dispatcher){
        var customEvent;
        try {
            customEvent = new CustomEvent(evtName, { detail: attrs, bubbles: true, cancelable: true });
        } catch (e) {
            customEvent = document.createEvent('CustomEvent');
            customEvent.initCustomEvent(evtName, true, true, attrs || null);
        }
        if (attrs) {
            for(var k in attrs){
                if(attrs.hasOwnProperty(k) && !(k in customEvent)) {
                    try { customEvent[k] = attrs[k]; } catch (err) {}
                }
            }
        }
        (dispatcher || document).dispatchEvent(customEvent);
    }

    function makeEl(type, attrs, parent, onLoad, onError) {
        var el = document.createElement(type);
        for(var k in attrs){
            if(attrs.hasOwnProperty(k)) {
                if (k === 'style' && typeof attrs[k] === 'object') Object.assign(el.style, attrs[k]);
                else el.setAttribute(k, attrs[k]);
            }
        }
        if (type === 'script' || type === 'link') {
            if (typeof onLoad === 'function') el.onload = onLoad;
            if (typeof onError === 'function') el.onerror = onError;
        }
        if (parent) parent.appendChild(el);
        return el;
    }
    function makeDiv(attrs, parent){ return makeEl('div', attrs, parent); }

    function injectStylesheet(url, onLoad, onError){
        makeEl('link', { rel: 'stylesheet', href: url, type: 'text/css' }, document.head, onLoad, onError);
    }

    function map(listLike, f){
        if (!listLike) return [];
        return Array.prototype.slice.call(listLike).map(f);
    }
    function invoke(objs, funcName, args){
        args = args || [];
        var objsAreFuncs = false;
        if (objs === null || objs === undefined) return [];
        if (!Array.isArray(objs)) objs = [objs];
        if(typeof funcName === "object" && funcName !== null) { args = funcName; }
        else if(typeof funcName === "undefined") { objsAreFuncs = true; }

        return map(objs, function(o){
            if (o === null || o === undefined) return undefined;
            try {
                return objsAreFuncs ? (typeof o === 'function' ? o.apply(null, args) : undefined)
                                    : (o && typeof o[funcName] === 'function' ? o[funcName].apply(o, args) : undefined);
            } catch (e) { return undefined; }
        }).filter(function(item) { return item !== undefined; });
    }

    var _globalKeydownListener = null;

    function showGUI(){
        var sqRoot = document.querySelector('.sq');
        if (sqRoot) {
            sqRoot.style.display = 'block';
            sq.closed = false;
            applyTheme(); // Re-apply theme in case it changed while hidden
        }
        document.body.classList.add('sq-page-blurred');
        if (_globalKeydownListener) _globalKeydownListener(); // Remove previous if any
        _globalKeydownListener = on(document, 'keydown', handleKeypress);
    }

    function hideGUI(){
        var sqRoot = document.querySelector('.sq');
        if (sqRoot) {
            sqRoot.style.display = 'none';
        }
        document.body.classList.remove('sq-page-blurred');
        if (_globalKeydownListener) {
            _globalKeydownListener();
            _globalKeydownListener = null;
        }
        sq.closed = true;
        if (nextNodeTimeoutId) clearTimeout(nextNodeTimeoutId);
        dispatch('squirt.gui.closed'); // For any internal cleanup
    }

    var keyHandlers = {
        32: function() { dispatch('squirt.play.toggle'); },
        27: function() { dispatch('squirt.close'); },
        38: function() { dispatch('squirt.wpm.adjust', {value: 25}); },
        40: function() { dispatch('squirt.wpm.adjust', {value: -25}); },
        37: function() { dispatch('squirt.rewind', {seconds: 5}); }
    };

    function handleKeypress(e){
        if (sq.closed) return;
        var handler = keyHandlers[e.keyCode];
        if (handler) {
            e.preventDefault();
            e.stopPropagation();
            handler();
        }
    }

    function makeTextToNodes(wordToNodeFn) {
        return function textToNodes(text) {
            text = "3\n2\n1\n" + text.trim().replace(/\s+\n/g,'\n');
            return text
                 .replace(/([,.\!\?\:\;])(?![\"\'\)\]\}])/g, "$1 ")
                 .replace(/—/g, " — ")
                 .split(/[\s\n]+/g)
                 .filter(function(word){ return word.length > 0; })
                 .map(wordToNodeFn);
        };
    }

    var instructionsRE = /#SQ(.*?)SQ#/;
    function parseSQInstructionsForWord(word, node){
        var match = word.match(instructionsRE);
        if(match && match.length > 1){
            node.instructions = [];
            match[1].split('#')
            .filter(function(w){ return w.length > 0; })
            .forEach(function(instruction){
                var parts = instruction.split('=');
                if (parts.length === 2) {
                    var val = Number(parts[1]);
                    if (!isNaN(val)) {
                        node.instructions.push(function(){ dispatch('squirt.wpm', {value: val}); });
                    }
                }
            });
            return word.replace(instructionsRE, '');
        }
        return word;
    }

    function getORPIndex(word){
        var length = word.length;
        if (length === 0) return 0;
        var lastChar = word[word.length - 1];
        if(lastChar === '\n'){
            if (length > 1) lastChar = word[word.length - 2]; else return 0;
            length--;
        }
        if (length === 0) return 0;
        if(',.?!:;"\''.indexOf(lastChar) !== -1 && length > 1) length--;
        return length <= 1 ? 0 : (length === 2 ? 1 : (length === 3 ? 1 : Math.floor(length / 2) - (length % 2 === 0 ? 1 : 0) ));
    }

    function wordToNode(word) {
        var node = makeDiv({'class': 'word'});
        node.word = parseSQInstructionsForWord(word, node);
        var orpIdx = getORPIndex(node.word);

        node.word.split('').forEach(function charToNode(char, idx) {
            var span = makeEl('span', {}, node);
            span.textContent = char;
            if(idx === orpIdx) span.classList.add('orp');
        });

        node.center = (function(orpCharNode) {
            if (orpCharNode && typeof orpCharNode.offsetLeft === 'number') {
                var orpCenter = orpCharNode.offsetLeft + (orpCharNode.offsetWidth / 2);
                var parentCenter = node.parentNode ? node.parentNode.offsetWidth / 2 : 0; // word-container center
                node.style.left = (parentCenter - orpCenter) + "px";
            } else { // Fallback: center the whole word if ORP not found or invalid
                var wordCenter = node.offsetWidth / 2;
                var parentCenterFallback = node.parentNode ? node.parentNode.offsetWidth / 2 : 0;
                node.style.left = (parentCenterFallback - wordCenter) + "px";
            }
        }).bind(null, node.children[orpIdx]);
        return node;
    }

    function readabilityFail(message){
        var finalWordContainer = document.querySelector('.sq .final-word');
        if (finalWordContainer) {
            finalWordContainer.innerHTML = '<div class="error">' + (message || 'Oops! Squirt could not read this page.') + ' Try selecting text.</div>';
            finalWordContainer.style.display = 'block';
        }
        var readerUi = document.querySelector('.sq .reader');
        if (readerUi) readerUi.style.display = 'none';
    }


    (function setupSquirtCore() {
        var nodes, nodeIdx = -1, lastNode, intervalMs, currentWpm = 400;
        sq.paused = true; // Start paused

        var wordContainer = null, prerenderer = null, finalWordContainer = null;

        function initDomRefsAndGUI(){
            var existingSquirt = document.querySelector('.sq');
            if (existingSquirt) existingSquirt.remove();

            var squirtRoot = makeDiv({class: 'sq'}, document.body);
            var obscure = makeDiv({class: 'sq-obscure'}, squirtRoot);
            var modal = makeDiv({'class': 'modal'}, squirtRoot);
            var controlsEl = makeDiv({'class':'controls'}, modal);
            var readerEl = makeDiv({'class': 'reader'}, modal);
            wordContainer = makeDiv({'class': 'word-container'}, readerEl);
            makeDiv({'class': 'focus-indicator-gap'}, wordContainer);
            prerenderer = makeDiv({'class': 'word-prerenderer'}, wordContainer);
            finalWordContainer = makeDiv({'class': 'final-word'}, modal);
            makeDiv({'class': 'keyboard-shortcuts'}, readerEl).innerHTML = "⌫ Space, Esc, ↑, ↓, ←";

            on(obscure, 'click', function(e){ e.stopPropagation(); dispatch('squirt.close'); });

            // --- Controls ---
            var wpmDisplayControl = makeDiv({'class': 'sq wpm sq control'}, controlsEl);
            var wpmLink = makeEl('a', {}, wpmDisplayControl);
            wpmLink.textContent = currentWpm + " WPM";

            var wpmSelector = makeDiv({'class': 'sq wpm-selector'}, wpmDisplayControl);
            [200, 300, 400, 500, 600, 700, 800, 900].forEach(function(wVal) {
                var opt = makeDiv({'class': 'sq wpm-option'}, wpmSelector);
                opt.textContent = wVal + " WPM";
                on(opt, 'click', function(){
                    dispatch('squirt.wpm', {value: wVal});
                    wpmSelector.style.display = 'none'; // Hide selector after choice
                    dispatch('squirt.play'); // Resume play
                });
            });
            on(wpmDisplayControl, 'click', function(e){
                if (e.target === wpmDisplayControl || e.target === wpmLink) { // Click on button, not options
                    var isVisible = wpmSelector.style.display === 'block';
                    wpmSelector.style.display = isVisible ? 'none' : 'block';
                    if (!isVisible) dispatch('squirt.pause'); // Pause when opening selector
                }
            });

            var rewindControl = makeEl('div', {'class': 'sq rewind sq control'}, controlsEl);
            makeEl('a', {'href': '#', innerHTML: "<i class='fa fa-fast-backward'></i> 5s"}, rewindControl);
            on(rewindControl, 'click', function(e){ e.preventDefault(); dispatch('squirt.rewind', {seconds: 5}); });

            var pausePlayControl = makeEl('div', {'class': 'sq pause-play control'}, controlsEl);
            var pausePlayLink = makeEl('a', {'href': '#'}, pausePlayControl);
            on(pausePlayControl, 'click', function(e){ e.preventDefault(); dispatch('squirt.play.toggle'); });
            
            function updateWpmDisplay(newWpmVal) {
                currentWpm = Math.max(50, Math.min(2000, Number(newWpmVal)));
                intervalMs = 60 * 1000 / currentWpm;
                wpmLink.textContent = currentWpm + " WPM";
                sq.wpm = currentWpm; // Update global sq object if needed
            }
            updateWpmDisplay(currentWpm); // Initial display

            function updatePlayPauseIcon() {
                pausePlayLink.innerHTML = sq.paused ? "<i class='fa fa-play'></i> Play" : "<i class='fa fa-pause'></i> Pause";
            }
            updatePlayPauseIcon(); // Initial icon

            // Event Listeners for core logic
            on('squirt.wpm', function(e){ if (e && typeof e.value !== 'undefined') updateWpmDisplay(e.value); });
            on('squirt.wpm.adjust', function(e){ if (e && typeof e.value === 'number') updateWpmDisplay(currentWpm + e.value); });
            on('squirt.play.toggle', function(){ sq.paused ? dispatch('squirt.play') : dispatch('squirt.pause'); });
            on('squirt.play', function(e) {
                sq.paused = false;
                updatePlayPauseIcon();
                wpmSelector.style.display = 'none'; // Hide WPM selector on play
                advanceWord(e && e.detail && e.detail.jumped);
            });
            on('squirt.pause', function() {
                sq.paused = true;
                updatePlayPauseIcon();
                if (nextNodeTimeoutId) clearTimeout(nextNodeTimeoutId);
            });
            on('squirt.rewind', function(e){
                if (!nodes || nodes.length === 0) return;
                if (!sq.paused) clearTimeout(nextNodeTimeoutId);
                var secondsToRewind = (e.detail && typeof e.detail.seconds === 'number') ? e.detail.seconds : 5;
                var wordsToRewind = Math.floor(secondsToRewind * 1000 / (intervalMs || 60000/400));
                nodeIdx = Math.max(-1, nodeIdx - wordsToRewind); // Allow -1 to restart from 0
                
                var rewindCount = 0;
                while(nodeIdx > 0 && nodes[nodeIdx+1] && !nodes[nodeIdx+1].word.match(/\.|\?|!|\n/) && rewindCount < 50){
                    nodeIdx--; rewindCount++;
                }
                advanceWord(true); // Jumped = true
            });
            on(document, 'squirt.close', function() { // Listen on document
                if (!sq.closed) hideGUI();
            });

            showGUI();
        }

        function loadTextAndStart() {
            var textContent;
            if(window.squirtText) { textContent = window.squirtText; }
            else {
                var selection = window.getSelection();
                if(selection && selection.type == 'Range' && selection.rangeCount > 0) {
                    var container = document.createElement("div");
                    for (var i = 0, len = selection.rangeCount; i < len; ++i) {
                        container.appendChild(selection.getRangeAt(i).cloneContents());
                    }
                    textContent = container.textContent;
                } else { // Fallback to Readability
                    if (window.readability && typeof window.readability.grabArticleText === 'function') {
                        try {
                            textContent = window.readability.grabArticleText();
                        } catch (err) {
                            readabilityFail("Readability processing failed."); return;
                        }
                    } else { // Readability not loaded yet, or failed
                        makeEl('script', { src: sq.host + 'readability.js' }, document.head,
                            function readabilityLoaded() { // onLoad
                                if (window.readability && typeof window.readability.grabArticleText === 'function') {
                                    try {
                                        textContent = window.readability.grabArticleText();
                                        if (textContent && textContent.trim() !== "") processAndRead(textContent);
                                        else readabilityFail("Readability found no content.");
                                    } catch (err) {
                                        readabilityFail("Readability execution error after load.");
                                    }
                                } else {
                                    readabilityFail("Readability script loaded but not functional.");
                                }
                            },
                            function readabilityError() { // onError
                                readabilityFail("Failed to load Readability.js script.");
                            }
                        );
                        return; // Wait for Readability to load
                    }
                }
            }
            processAndRead(textContent);
        }

        function processAndRead(text) {
            if (!text || typeof text !== 'string' || text.trim() === "") {
                readabilityFail("No text content found or provided to read.");
                return;
            }
            nodes = makeTextToNodes(wordToNode)(text);
            if (!nodes || nodes.length === 0) {
                readabilityFail("Could not process text into readable words.");
                return;
            }
            nodeIdx = -1; // Ready to start from the beginning
            dispatch('squirt.play', { jumped: true }); // Start reading
        }
        
        function prerenderCurrentWord(){
            if (!prerenderer || !nodes || nodeIdx + 1 < 0 || nodeIdx + 1 >= nodes.length) return;
            var wordNodeToPrerender = nodes[nodeIdx + 1];
            if (!wordNodeToPrerender) return;
            while (prerenderer.firstChild) { prerenderer.removeChild(prerenderer.firstChild); }
            var clonedNode = wordNodeToPrerender.cloneNode(true); // Clone to avoid issues
            prerenderer.appendChild(clonedNode);
            if (typeof clonedNode.center === 'function') { // Recalculate center for cloned if necessary
                 clonedNode.center = (function(orpCharNode) {
                    if (orpCharNode && typeof orpCharNode.offsetLeft === 'number') {
                        var orpCenter = orpCharNode.offsetLeft + (orpCharNode.offsetWidth / 2);
                        var parentCenter = clonedNode.parentNode ? clonedNode.parentNode.offsetWidth / 2 : 0;
                        clonedNode.style.left = (parentCenter - orpCenter) + "px";
                    } else {
                        var wordCenter = clonedNode.offsetWidth / 2;
                        var parentCenterFallback = clonedNode.parentNode ? clonedNode.parentNode.offsetWidth / 2 : 0;
                        clonedNode.style.left = (parentCenterFallback - wordCenter) + "px";
                    }
                }).bind(null, clonedNode.children[getORPIndex(clonedNode.word)]);
                clonedNode.center();
            }
        }

        function advanceWord(jumped) {
            if (sq.paused) return;
            if (lastNode && lastNode.parentNode) lastNode.remove();

            nodeIdx++;
            if (!nodes || nodeIdx >= nodes.length) { // Finished reading
                if (finalWordContainer) {
                    finalWordContainer.innerHTML = "<div>All done!</div>";
                    finalWordContainer.style.display = 'block';
                }
                if (readerEl) readerEl.style.display = 'none'; // Hide word display area
                dispatch('squirt.pause'); // Go to paused state
                return;
            }

            lastNode = nodes[nodeIdx];
            if (!wordContainer || !lastNode) return;
            wordContainer.appendChild(lastNode);
            if (typeof lastNode.center === 'function') lastNode.center();
            if(lastNode.instructions) invoke(lastNode.instructions);

            prerenderCurrentWord();

            var delayMultiplier = 1;
            if (jumped) delayMultiplier = 2.5; // Longer pause after jump/rewind/start
            else {
                var wordStr = lastNode.word;
                var lastChar = wordStr[wordStr.length - 1];
                if (lastChar === '\n') delayMultiplier = 2.5;
                else if ('.!?'.indexOf(lastChar) !== -1) delayMultiplier = 2.0;
                else if (',;:–'.indexOf(lastChar) !== -1) delayMultiplier = 1.5;
                else if (wordStr.length < 4) delayMultiplier = 1.2;
                else if (wordStr.length > 11) delayMultiplier = 1.3;
            }
            nextNodeTimeoutId = setTimeout(function() { advanceWord(false); }, intervalMs * delayMultiplier);
        }
        
        // Initial setup
        injectStylesheet('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css', 
            null, 
            function() { /* console.warn("Could not load Font Awesome."); */ }
        );
        injectStylesheet(sq.host + 'squirt.css', 
            function stylesLoaded(){
                initDomRefsAndGUI();
                loadTextAndStart();
            },
            function stylesError() {
                alert("Squirt: Failed to load main stylesheet. UI may be broken.");
                initDomRefsAndGUI(); // Try to init GUI anyway
                loadTextAndStart();
            }
        );
         // Listen for 'squirt.again' to restart/re-show
        on(document, 'squirt.again', function() {
            if (sq.closed) {
                var gui = document.querySelector('.sq');
                if (!gui) { // If GUI was removed entirely
                    initDomRefsAndGUI(); // Rebuild GUI
                    loadTextAndStart(); // And reload text
                } else {
                    showGUI();
                    // Resume from where it left off, or restart text?
                    // For simplicity, let's restart the text.
                    nodeIdx = -1; // Reset index
                    if (finalWordContainer) finalWordContainer.style.display = 'none';
                    if (readerEl) readerEl.style.display = 'block';
                    loadTextAndStart(); // This will re-evaluate text source
                }
            } else {
                // If it's already open, maybe bring to front or just ensure it's not paused
                dispatch('squirt.play');
            }
        });
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
        }

    })(); // End of setupSquirtCore IIFE

})(); // End of main Squirt IIFE