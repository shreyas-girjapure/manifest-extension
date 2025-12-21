"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const extension_1 = require("../src/extension");
describe('buildPackageFromText', () => {
    it('builds package.xml from simple selection ranges', () => {
        const text = `
<Package>
<types>
  <members>MyClass</members>
  <name>ApexClass</name>
</types>
</Package>
`;
        const ranges = [{ start: text.indexOf('<members>'), end: text.indexOf('</name>') + '</name>'.length }];
        const pkg = (0, extension_1.buildPackageFromText)(text, ranges);
        (0, chai_1.expect)(pkg).to.be.a('string');
        (0, chai_1.expect)(pkg).to.include('<name>ApexClass</name>');
        (0, chai_1.expect)(pkg).to.include('<members>MyClass</members>');
    });
});
//# sourceMappingURL=buildPackage.test.js.map