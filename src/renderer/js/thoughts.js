/* ------------------------------------------------------------------ *
 * "Thinking" captions — the agent talks to itself while it works.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  const THOUGHTS = [
    'Reading the room…',
    'Opening the filing cabinet…',
    'Sharpening the pencil…',
    'Consulting the archive…',
    'Tracing the logic…',
    'Weighing the options…',
    'Sketching a plan…',
    'Cross-checking facts…',
    'Squinting at the fine print…',
    'Stapling pages together…',
    'Refusing to cut corners…',
    'Rolling up sleeves…',
    'Counting the edge cases…',
    'Polishing the corners…',
    'Asking a second opinion…',
    'Locating the bug…',
    'Writing it down properly…',
    'Reading it back twice…',
    'Brewing a plan…',
    'Building a mental model…',
    'Checking who needs this…',
    'Avoiding the obvious trap…',
    'Simplifying the sentence…',
    'Doing the boring part honestly…',
    'Numbering the paragraphs…',
    'Sealing the envelope…',
    'Working the night shift…',
    'Forming a committee of one…',
    'Reviewing the draft…',
    'Making bold choices…',
    'Guarding the details…',
    'Following the paper trail…',
    'Untangling the syntax…',
    'Filing it under “important”…',
    'Thinking out loud, quietly…',
    'This one needs care…',
    'There, that reads better…',
    'Checking the margin…',
    'Drafting, deleting, drafting…',
    'Remembering the rules…',
    'Trusting the process…',
    'Almost there…',
    'Making sure it compiles…',
    'Preparing the artifact…'
  ];

  const TOOL_THOUGHTS = [
    'Knocking on {conn}…',
    'Reaching into {conn}…',
    'Requesting {tool} from {conn}…',
    'Signed, sealed, requesting {tool}…',
    'Asking {conn} for data…'
  ];

  const CODE_THOUGHTS = [
    'Writing the artifact…',
    'Consolidating the code…',
    'Assembling a single file…',
    'Making the file runnable…',
    'Every line accounted for…'
  ];

  function pool(kind) {
    return kind === 'code' ? CODE_THOUGHTS : THOUGHTS;
  }

  function next(kind, previous) {
    const p = pool(kind);
    let pick = p[Math.floor(Math.random() * p.length)];
    let guard = 0;
    while (pick === previous && guard++ < 8) pick = p[Math.floor(Math.random() * p.length)];
    return pick;
  }

  function forTool(connTitle, toolName) {
    const t = TOOL_THOUGHTS[Math.floor(Math.random() * TOOL_THOUGHTS.length)];
    return t.replace('{conn}', connTitle).replace('{tool}', toolName);
  }

  window.Thoughts = { next, forTool };
})();
