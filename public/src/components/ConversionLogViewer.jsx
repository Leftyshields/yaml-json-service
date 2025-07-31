import React, { useState, useEffect, useRef } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Collapse,
  IconButton
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import InfoIcon from '@mui/icons-material/Info';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import FileIcon from '@mui/icons-material/InsertDriveFile';
import CodeIcon from '@mui/icons-material/Code';
import { API_BASE_URL } from '../config';

/**
 * Real-time conversion log viewer component
 * Shows live updates during file conversion process
 */
const ConversionLogViewer = ({ streamId, onComplete }) => {
  const [connected, setConnected] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const logContainerRef = useRef(null);
  
  // Auto-scroll logs when new items are added
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);
  
  // Set up WebSocket connection
  useEffect(() => {
    // Skip if no streamId
    if (!streamId) return;
    
    const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/ws?clientId=ui-${Date.now()}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
      
      // Subscribe to the specified stream
      ws.send(JSON.stringify({
        type: 'subscribe',
        streamId
      }));
      
      // Add connection message to logs
      setLogs(prev => [...prev, {
        id: Date.now(),
        type: 'info',
        message: 'Connected to conversion stream',
        timestamp: new Date().toISOString()
      }]);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WebSocket message:', data);
        
        switch (data.type) {
          case 'connection':
            // Initial connection acknowledgment
            break;
            
          case 'subscribed':
            // Successfully subscribed to stream
            setLogs(prev => [...prev, {
              id: Date.now(),
              type: 'info',
              message: `Monitoring conversion stream: ${data.streamId}`,
              timestamp: new Date().toISOString()
            }]);
            break;
            
          case 'conversionUpdate':
            // Handle conversion progress update
            handleConversionUpdate(data);
            break;
            
          case 'error':
            // Handle error
            setError(data.message);
            setLogs(prev => [...prev, {
              id: Date.now(),
              type: 'error',
              message: data.message,
              timestamp: new Date().toISOString()
            }]);
            break;
            
          default:
            console.log('Unknown message type:', data.type);
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
      }
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      
      // Add disconnection message to logs
      setLogs(prev => [...prev, {
        id: Date.now(),
        type: 'warning',
        message: 'Disconnected from conversion stream',
        timestamp: new Date().toISOString()
      }]);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
      
      // Add error message to logs
      setLogs(prev => [...prev, {
        id: Date.now(),
        type: 'error',
        message: 'WebSocket connection error',
        timestamp: new Date().toISOString()
      }]);
    };
    
    // Clean up on unmount
    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [streamId]);
  
  // Handle conversion updates
  const handleConversionUpdate = (data) => {
    // Add to logs
    setLogs(prev => [...prev, {
      id: Date.now(),
      type: data.status === 'error' ? 'error' : 'info',
      message: data.message,
      details: data.details,
      timestamp: new Date().toISOString()
    }]);
    
    // Handle completed conversion
    if (data.status === 'completed') {
      setResult(data.result);
      
      // Notify parent component
      if (onComplete) {
        onComplete(data.result);
      }
    }
    
    // Handle errors
    if (data.status === 'error') {
      setError(data.message);
    }
  };
  
  // Format timestamp for display
  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString();
    } catch (err) {
      return 'Invalid time';
    }
  };
  
  // Get icon based on log type
  const getLogIcon = (type) => {
    switch (type) {
      case 'error':
        return <ErrorIcon color="error" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'success':
        return <CheckCircleIcon color="success" />;
      case 'file':
        return <FileIcon color="primary" />;
      case 'code':
        return <CodeIcon color="secondary" />;
      case 'info':
      default:
        return <InfoIcon color="info" />;
    }
  };
  
  return (
    <Paper 
      elevation={1} 
      sx={{ 
        mt: 2,
        mb: 2,
        border: '1px solid #e0e0e0',
        borderRadius: 1,
        overflow: 'hidden'
      }}
    >
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          p: 1.5,
          pl: 2,
          bgcolor: '#f5f5f5',
          borderBottom: '1px solid #e0e0e0'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          {connected ? (
            <Box 
              sx={{ 
                width: 10, 
                height: 10, 
                borderRadius: '50%', 
                bgcolor: 'success.main',
                mr: 1.5
              }} 
            />
          ) : (
            <CircularProgress size={14} sx={{ mr: 1.5 }} />
          )}
          <Typography variant="subtitle2">
            Conversion Log
          </Typography>
          {result && (
            <Typography 
              variant="caption" 
              sx={{ 
                ml: 2, 
                px: 1, 
                py: 0.5, 
                bgcolor: 'success.light', 
                borderRadius: 1,
                color: 'success.contrastText'
              }}
            >
              Conversion Complete
            </Typography>
          )}
        </Box>
        
        <IconButton 
          size="small" 
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </IconButton>
      </Box>
      
      <Collapse in={expanded}>
        <List 
          dense 
          sx={{ 
            height: '300px', 
            overflow: 'auto',
            bgcolor: '#fafafa', 
            p: 0 
          }}
          ref={logContainerRef}
        >
          {logs.map((log, index) => (
            <React.Fragment key={log.id}>
              {index > 0 && <Divider component="li" />}
              <ListItem sx={{ py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  {getLogIcon(log.type)}
                </ListItemIcon>
                <ListItemText
                  primary={log.message}
                  secondary={formatTime(log.timestamp)}
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: log.type === 'error' ? 'medium' : 'regular',
                    color: log.type === 'error' ? 'error.main' : 'text.primary'
                  }}
                  secondaryTypographyProps={{
                    variant: 'caption',
                    color: 'text.secondary'
                  }}
                />
              </ListItem>
              {log.details && (
                <ListItem sx={{ py: 0, pl: 8 }}>
                  <ListItemText
                    primary={log.details}
                    primaryTypographyProps={{
                      variant: 'caption',
                      sx: { 
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        color: 'text.secondary',
                        whiteSpace: 'pre-wrap'
                      }
                    }}
                  />
                </ListItem>
              )}
            </React.Fragment>
          ))}
          
          {logs.length === 0 && (
            <Box sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Waiting for conversion to start...
              </Typography>
            </Box>
          )}
        </List>
        
        {result && (
          <Box sx={{ p: 2, borderTop: '1px solid #e0e0e0' }}>
            <Typography variant="subtitle2" gutterBottom>
              Conversion Result Preview
            </Typography>
            {result.yamlPreview && (
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 1.5,
                  maxHeight: '150px',
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  bgcolor: '#f8f9fa'
                }}
              >
                <pre style={{ margin: 0 }}>
                  {result.yamlPreview}
                </pre>
              </Paper>
            )}
          </Box>
        )}
        
        {error && (
          <Box sx={{ p: 2, bgcolor: '#fff1f1', borderTop: '1px solid #ffcdd2' }}>
            <Typography variant="subtitle2" color="error">
              Error:
            </Typography>
            <Typography variant="body2" color="error.main">
              {error}
            </Typography>
          </Box>
        )}
      </Collapse>
    </Paper>
  );
};

export default ConversionLogViewer;
