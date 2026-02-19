import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import moment from 'moment';

export default function DuplicateDetectedModal({ duplicate, projectId, onLinkToProject, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-900 mb-1">Duplicate Source Detected</h2>
            <p className="text-sm text-slate-600">This source already exists in your library.</p>
          </div>
        </div>

        {/* Duplicate Info */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
          <div>
            <div className="text-xs text-slate-500 mb-1">Existing Source</div>
            <div className="font-semibold text-slate-900">{duplicate.title}</div>
          </div>
          
          {duplicate.category && duplicate.region_code && (
            <div className="text-sm text-slate-600">
              {duplicate.category} • {duplicate.region_code}
            </div>
          )}
          
          {duplicate.date && (
            <div className="text-xs text-slate-500">
              Uploaded {moment(duplicate.date).format('MMM D, YYYY')} ({moment(duplicate.date).fromNow()})
            </div>
          )}
        </div>

        {/* Message */}
        <p className="text-sm text-slate-700">
          To maintain data integrity, duplicate sources cannot be uploaded. You can view the existing source or link it to your current project.
        </p>

        {/* Actions */}
        <div className="flex gap-3">
          <Link 
            to={createPageUrl('SourcesDatabase')} 
            className="flex-1"
            onClick={onClose}
          >
            <Button variant="outline" className="w-full gap-2">
              <ExternalLink className="w-4 h-4" />
              View in Library
            </Button>
          </Link>

          {projectId && onLinkToProject && (
            <Button 
              onClick={() => {
                onLinkToProject(duplicate.id);
                onClose();
              }} 
              className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2"
            >
              <LinkIcon className="w-4 h-4" />
              Link to Project
            </Button>
          )}

          {!projectId && (
            <Button onClick={onClose} className="flex-1 bg-slate-600 hover:bg-slate-700">
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}