export const statusLabels={pass:'Passed',warning:'Needs attention',unknown:'Not verified'};
export function reportText(report){
 const lines=['SE LABS — Website readiness audit',report.url,`Checked: ${report.checkedAt}`,'',`${report.summary.passed} passed · ${report.summary.warnings} need attention · ${report.summary.unknown} not verified`,'','PRIORITIES'];
 if(!report.priorities.length)lines.push('No actionable warnings in the completed checks. This is not a ranking or visibility result.');
 for(const check of report.priorities)lines.push('',check.title,check.evidence,`Next step: ${check.recommendation}`);
 lines.push('','ALL CHECKS');
 for(const check of report.checks)lines.push('',`${statusLabels[check.status]||'Not verified'} — ${check.title}`,check.evidence,`Next step: ${check.recommendation||'Review the evidence.'}`);
 lines.push('','SCOPE & LIMITATIONS',...report.limitations.map(x=>`• ${x}`));
 return lines.join('\n');
}
export function reportSummary(report){
 if(report.summary.warnings)return `${report.summary.warnings} ${report.summary.warnings===1?'check needs':'checks need'} attention. Start with the priorities below.`;
 if(report.summary.unknown)return 'The completed checks passed. Review the checks we could not verify before deciding what to improve.';
 return 'The checked foundations are in place. This does not confirm search rankings or AI visibility.';
}
