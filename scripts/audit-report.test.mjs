import test from 'node:test';
import assert from 'node:assert/strict';
import { reportText, reportSummary } from '../src/lib/audit-report.mjs';
const report={url:'https://example.com/',checkedAt:'2026-10-01',summary:{passed:1,warnings:1,unknown:0},priorities:[{title:'Main heading',evidence:'No H1 found',recommendation:'Add a descriptive H1'}],checks:[{title:'Main heading',status:'warning',evidence:'No H1 found',recommendation:'Add a descriptive H1'}],limitations:['Not a ranking test']};
test('readable export retains evidence, next steps, site and limits',()=>{const text=reportText(report);for(const value of ['https://example.com/','No H1 found','Add a descriptive H1','Not a ranking test'])assert.ok(text.includes(value));});
test('summary distinguishes warning, unknown and passing checks without ranking claims',()=>{assert.match(reportSummary(report),/1 check needs attention/);assert.match(reportSummary({...report,summary:{warnings:0,unknown:1}}),/could not verify/);assert.match(reportSummary({...report,summary:{warnings:0,unknown:0}}),/does not confirm/);});
