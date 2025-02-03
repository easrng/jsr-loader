import { printProgress } from "jsr:@luca/flag";
import { encodeCbor } from "jsr:@std/cbor/encode-cbor";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { toText } from "jsr:@std/streams/to-text";

const container = document.createElement("pre");
container.textContent = "anyway here's @luca/flag\n\n";
document.body.append(container);
const realConsoleLog = console.log;
console.log = (_str: string, ...csses: string[]) => {
  container.append(
    ...csses.map(
      (css) =>
        css &&
        Object.assign(document.createElement("span"), {
          textContent: " ",
          style: css,
        })
    ),
    "\n"
  );
};
try {
  printProgress();
} finally {
  console.log = realConsoleLog;
}
container.append("\nchat what if we use @std/cbor and @std/encoding\n");
container.append(
  encodeBase64(
    encodeCbor({
      awawa: true,
    })
  )
);
container.append("\nwow that sure is some base64 right there\n");
container.append(
  "\nhmm what about @std/streams? that one could be useful in browsers too\n"
);
container.append(
  (await toText((await fetch("./main.ts")).body!))
    .split("\n")
    .map((e) => "> " + e)
    .join("\n")
);
container.append("\nok yeah that works too. don't use this in prod probably. have fun.\n");
