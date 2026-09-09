import {loadEnvConfig} from '@next/env';
import {randomUUID} from 'node:crypto';
loadEnvConfig(process.cwd());
async function main(){
 const {sql}=await import('../src/db/client');
 const {ensureOperationsSchema}=await import('../src/lib/operations-store');
 const {runOneAnalysisJob}=await import('../src/lib/analysis-worker');
 await ensureOperationsSchema();
 const site='RAG สนง.กฟส.ระแงะ',month='2026-02',trigger='verification:'+randomUUID();
 const pending=await sql`select count(*)::integer as count from solar_ai_jobs where status in ('queued','running')`;
 if(Number(pending[0].count)>0)throw Error('Existing work pending; verification will not process other jobs');
 const inserted=await sql`insert into solar_ai_jobs(trigger_key,site_name,report_month) values (${trigger},${site},${month}) returning id`;
 await runOneAnalysisJob();
 const jobs=await sql`select status,attempts,last_error,result is not null as has_result from solar_ai_jobs where id=${inserted[0].id}::uuid`;
 console.log(JSON.stringify({purpose:'Real queue verification using existing report; no report or maintenance mutation',jobs},null,2));
}
main().catch(()=>{console.error('Queue verification failed; inspect sanitized job status');process.exitCode=1});
